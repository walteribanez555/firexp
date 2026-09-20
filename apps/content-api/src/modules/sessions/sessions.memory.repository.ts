import { createLogger } from '../../config';
import type {
  ISessionsRepository,
  SessionMeta,
  SessionDecision,
  EpisodeStats,
} from './sessions.repository';
import type { Flags } from '@fire-stick/types';

const logger = createLogger('SessionsMemoryRepository');

// ── Aggregate bucket key: `<episodeId>#<decisionId>#<optionId>` ───────────────
type AggKey = string;

export class SessionsMemoryRepository implements ISessionsRepository {
  /** META items keyed by roomCode */
  private readonly metas = new Map<string, SessionMeta>();

  /** DECISION# items keyed by `<roomCode>#<chapterId>#<decisionId>` */
  private readonly decisions = new Map<string, SessionDecision>();

  /** AGG counts keyed by `<episodeId>#<decisionId>#<optionId>` */
  private readonly agg = new Map<AggKey, number>();

  async createSession(roomCode: string, episodeId: string): Promise<SessionMeta> {
    if (this.metas.has(roomCode)) {
      logger.debug('Session already exists (memory)', { roomCode });
      return this.metas.get(roomCode)!;
    }
    const meta: SessionMeta = {
      roomCode,
      episodeId,
      viewers:   0,
      startedAt: new Date().toISOString(),
    };
    this.metas.set(roomCode, meta);
    logger.info('Session created (memory)', { roomCode, episodeId });
    return meta;
  }

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

    // Persist DECISION# item
    const key = `${roomCode}#${chapterId}#${decisionId}`;
    this.decisions.set(key, { roomCode, chapterId, decisionId, chosen, votes, flagsAfter, ts });
    logger.info('Decision recorded (memory)', { roomCode, decisionId, chosen });

    // Fetch episodeId from META (needed for AGG key)
    const meta = this.metas.get(roomCode);
    if (!meta) {
      logger.warn('No session META found for roomCode — skipping AGG', { roomCode });
      return;
    }

    const { episodeId } = meta;

    // Increment AGG#<episodeId>#<decisionId>#<optionId>
    const chosenAggKey: AggKey = `${episodeId}#${decisionId}#${chosen}`;
    this.agg.set(chosenAggKey, (this.agg.get(chosenAggKey) ?? 0) + 1);

    // Increment total sentinel (special optionId = '__total__')
    const totalKey: AggKey = `${episodeId}#${decisionId}#__total__`;
    this.agg.set(totalKey, (this.agg.get(totalKey) ?? 0) + 1);
  }

  async getEpisodeStats(episodeId: string): Promise<EpisodeStats> {
    const prefix = `${episodeId}#`;
    const byDecision = new Map<string, { options: Map<string, number>; total: number }>();

    for (const [key, count] of this.agg) {
      if (!key.startsWith(prefix)) continue;
      // key = <episodeId>#<decisionId>#<optionId>
      const rest = key.slice(prefix.length);
      const hashIdx = rest.indexOf('#');
      if (hashIdx === -1) continue;
      const decisionId = rest.slice(0, hashIdx);
      const optionId   = rest.slice(hashIdx + 1);

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
      const total = bucket.total || 0;
      const options: Record<string, { count: number; pct: number }> = {};
      for (const [optionId, count] of bucket.options) {
        options[optionId] = {
          count,
          pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
        };
      }
      decisions[decisionId] = { total, options };
    }

    return { decisions };
  }

  async getSessionDecisions(roomCode: string): Promise<SessionDecision[]> {
    const result: SessionDecision[] = [];
    const prefix = `${roomCode}#`;
    for (const [key, dec] of this.decisions) {
      if (key.startsWith(prefix)) result.push(dec);
    }
    return result;
  }

  async getSession(roomCode: string): Promise<SessionMeta | null> {
    return this.metas.get(roomCode) ?? null;
  }
}
