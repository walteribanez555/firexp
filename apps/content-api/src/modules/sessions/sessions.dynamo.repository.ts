/**
 * DynamoDB implementation of ISessionsRepository.
 *
 * Single-table design for `firexp-sessions`:
 *   PK=SESSION#<roomCode>  SK=META
 *     → { episodeId, viewers, startedAt, endingId? }
 *
 *   PK=SESSION#<roomCode>  SK=DECISION#<chapterId>#<decisionId>
 *     → { chosen, votes, flagsAfter, ts }
 *
 *   PK=AGG#<episodeId>#<decisionId>  SK=OPTION#<optionId>
 *     → { count }  — incremented atomically with ADD
 *
 *   GSI  byEpisode: PK=episodeId  SK=startedAt  (on META items only — sparse)
 */

import {
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { getDocClient } from '../../orm/dynamo-client';
import { config, createLogger } from '../../config';
import type {
  ISessionsRepository,
  SessionMeta,
  SessionDecision,
  EpisodeStats,
} from './sessions.repository';
import type { Flags } from '@fire-stick/types';

const logger = createLogger('SessionsDynamoRepository');

function tableName(): string {
  return config.getValue('sessionsTable');
}

export class SessionsDynamoRepository implements ISessionsRepository {
  private get client() { return getDocClient(); }

  // ── createSession ──────────────────────────────────────────────────────────

  async createSession(roomCode: string, episodeId: string): Promise<SessionMeta> {
    const pk        = `SESSION#${roomCode}`;
    const sk        = 'META';
    const startedAt = new Date().toISOString();

    // Idempotent: only write if META doesn't exist yet
    try {
      await this.client.send(new PutCommand({
        TableName:           tableName(),
        Item:                { PK: pk, SK: sk, roomCode, episodeId, viewers: 0, startedAt },
        ConditionExpression: 'attribute_not_exists(PK)',
      }));
      logger.info('Session created (dynamo)', { roomCode, episodeId });
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
        logger.debug('Session already exists (dynamo)', { roomCode });
      } else {
        throw err;
      }
    }

    const meta = await this.getSession(roomCode);
    if (!meta) throw new Error(`Session META not found after create for roomCode=${roomCode}`);
    return meta;
  }

  // ── getSession ─────────────────────────────────────────────────────────────

  async getSession(roomCode: string): Promise<SessionMeta | null> {
    const res = await this.client.send(new GetCommand({
      TableName: tableName(),
      Key:       { PK: `SESSION#${roomCode}`, SK: 'META' },
    }));
    if (!res.Item) return null;
    return {
      roomCode:  res.Item['roomCode'] as string,
      episodeId: res.Item['episodeId'] as string,
      viewers:   res.Item['viewers'] as number,
      startedAt: res.Item['startedAt'] as string,
      endingId:  res.Item['endingId'] as string | undefined,
    };
  }

  // ── recordDecision ─────────────────────────────────────────────────────────

  async recordDecision(input: {
    roomCode:   string;
    chapterId:  string;
    decisionId: string;
    chosen:     string;
    votes:      Record<string, number>;
    flagsAfter: Flags;
    ts:         number;
  }): Promise<void> {
    const { roomCode, chapterId, decisionId, chosen, votes, flagsAfter, ts } = input;

    // Resolve episodeId for AGG key
    const meta      = await this.getSession(roomCode);
    const episodeId = meta?.episodeId ?? 'unknown';

    const aggPK = `AGG#${episodeId}#${decisionId}`;

    // Write DECISION item AND increment two AGG counters atomically
    await this.client.send(new TransactWriteCommand({
      TransactItems: [
        // 1. Write DECISION# item (upsert — no condition)
        {
          Put: {
            TableName: tableName(),
            Item: {
              PK:         `SESSION#${roomCode}`,
              SK:         `DECISION#${chapterId}#${decisionId}`,
              roomCode,
              chapterId,
              decisionId,
              episodeId,
              chosen,
              votes,
              flagsAfter,
              ts,
            },
          },
        },
        // 2. ADD 1 to the chosen option AGG counter
        {
          Update: {
            TableName:                 tableName(),
            Key:                       { PK: aggPK, SK: `OPTION#${chosen}` },
            UpdateExpression:          'ADD #c :one',
            ExpressionAttributeNames:  { '#c': 'count' },
            ExpressionAttributeValues: { ':one': 1 },
          },
        },
        // 3. ADD 1 to the total sentinel
        {
          Update: {
            TableName:                 tableName(),
            Key:                       { PK: aggPK, SK: 'OPTION#__total__' },
            UpdateExpression:          'ADD #c :one',
            ExpressionAttributeNames:  { '#c': 'count' },
            ExpressionAttributeValues: { ':one': 1 },
          },
        },
      ],
    }));

    logger.info('Decision recorded (dynamo)', { roomCode, decisionId, chosen, episodeId });
  }

  // ── getEpisodeStats ────────────────────────────────────────────────────────
  //
  // Reads only AGG#<episodeId>#* items (PK filter on Scan — no full table scan
  // in practice since the filter is pushed to DynamoDB; a GSI on episodeId is
  // the prod-scale solution but out of scope for this hackathon table size).

  async getEpisodeStats(episodeId: string): Promise<EpisodeStats> {
    const aggPrefix = `AGG#${episodeId}#`;
    const res       = await this.client.send(new ScanCommand({
      TableName:                 tableName(),
      FilterExpression:          'begins_with(#pk, :pfx)',
      ExpressionAttributeNames:  { '#pk': 'PK' },
      ExpressionAttributeValues: { ':pfx': aggPrefix },
    }));

    const items      = res.Items ?? [];
    const byDecision = new Map<string, { options: Map<string, number>; total: number }>();

    for (const item of items) {
      const pk         = item['PK'] as string;
      const sk         = item['SK'] as string;
      const count      = (item['count'] as number) ?? 0;
      const decisionId = pk.slice(aggPrefix.length);          // PK after prefix
      const optionId   = sk.slice('OPTION#'.length);           // SK after 'OPTION#'

      if (!byDecision.has(decisionId)) {
        byDecision.set(decisionId, { options: new Map(), total: 0 });
      }
      const bucket = byDecision.get(decisionId)!;

      if (optionId === '__total__') {
        bucket.total = count;
      } else {
        bucket.options.set(optionId, count);
      }
    }

    const decisions: EpisodeStats['decisions'] = {};
    for (const [decisionId, bucket] of byDecision) {
      const total   = bucket.total || 0;
      const options: Record<string, { count: number; pct: number }> = {};
      for (const [optId, cnt] of bucket.options) {
        options[optId] = {
          count: cnt,
          pct:   total > 0 ? Math.round((cnt / total) * 1000) / 10 : 0,
        };
      }
      decisions[decisionId] = { total, options };
    }

    return { decisions };
  }

  // ── getSessionDecisions ────────────────────────────────────────────────────

  async getSessionDecisions(roomCode: string): Promise<SessionDecision[]> {
    const res = await this.client.send(new QueryCommand({
      TableName:                 tableName(),
      KeyConditionExpression:    '#pk = :pk AND begins_with(#sk, :prefix)',
      ExpressionAttributeNames:  { '#pk': 'PK', '#sk': 'SK' },
      ExpressionAttributeValues: {
        ':pk':     `SESSION#${roomCode}`,
        ':prefix': 'DECISION#',
      },
    }));

    return (res.Items ?? []).map((item) => ({
      roomCode:   item['roomCode'] as string,
      chapterId:  item['chapterId'] as string,
      decisionId: item['decisionId'] as string,
      chosen:     item['chosen'] as string,
      votes:      item['votes'] as Record<string, number>,
      flagsAfter: item['flagsAfter'] as Flags,
      ts:         item['ts'] as number,
    }));
  }
}
