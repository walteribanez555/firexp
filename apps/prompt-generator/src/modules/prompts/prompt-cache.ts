import { createHash } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { config, createLogger } from '../../config';
import type { GeneratedPrompt, PromptRequest } from './prompts.types';

const logger = createLogger('PromptCache');

// ── DynamoDB client (lazy, singleton) ────────────────────────────────────────

let docClient: DynamoDBDocumentClient | null = null;

function getDocClient(): DynamoDBDocumentClient | null {
  const table = config.getValue('promptsTable');
  if (!table) return null;

  if (!docClient) {
    const raw = new DynamoDBClient({ region: config.getValue('awsRegion') });
    docClient  = DynamoDBDocumentClient.from(raw, {
      marshallOptions:   { removeUndefinedValues: true },
      unmarshallOptions: { wrapNumbers: false },
    });
  }
  return docClient;
}

// ── Cache key ─────────────────────────────────────────────────────────────────

/**
 * Deterministic cache key: SHA-256 of the normalised request fields.
 * Flags are sorted by key so insertion order does not affect the key.
 * Options gestures are sorted lexicographically.
 */
export function buildCacheKey(req: PromptRequest): string {
  const sortedFlags = Object.fromEntries(
    Object.entries(req.flags).sort(([a], [b]) => a.localeCompare(b)),
  );
  const sortedGestures = [...req.options.map((o) => o.gesture)].sort();

  const canonical = JSON.stringify({
    storyId:    req.storyId,
    chapterId:  req.chapterId,
    decisionId: req.decisionId,
    flags:      sortedFlags,
    gestures:   sortedGestures,
  });

  return createHash('sha256').update(canonical).digest('hex');
}

// ── Public cache API ──────────────────────────────────────────────────────────

export const promptCache = {
  async get(key: string): Promise<GeneratedPrompt | null> {
    const client = getDocClient();
    if (!client) return null;

    const table = config.getValue('promptsTable');
    try {
      const res = await client.send(new GetCommand({
        TableName: table,
        Key:       { cacheKey: key },
      }));

      if (!res.Item) return null;

      // Respect TTL: DynamoDB TTL deletion is eventual; guard client-side too
      const now = Math.floor(Date.now() / 1000);
      if (res.Item['ttl'] && (res.Item['ttl'] as number) < now) {
        logger.debug('Cache entry expired (client-side check)', { key });
        return null;
      }

      logger.debug('Cache hit', { key });
      return res.Item['prompt'] as GeneratedPrompt;
    } catch (err) {
      logger.warn('Cache get error — treating as miss', err);
      return null;
    }
  },

  async put(key: string, prompt: GeneratedPrompt): Promise<void> {
    const client = getDocClient();
    if (!client) return;

    const table  = config.getValue('promptsTable');
    const ttl    = Math.floor(Date.now() / 1000) + config.getValue('cacheTtlSeconds');

    try {
      await client.send(new PutCommand({
        TableName: table,
        Item:      { cacheKey: key, prompt, ttl },
      }));
      logger.debug('Cache put', { key, ttl });
    } catch (err) {
      logger.warn('Cache put error — continuing without caching', err);
    }
  },
};
