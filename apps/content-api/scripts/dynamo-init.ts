/**
 * dynamo-init.ts
 *
 * Idempotent script that:
 *   1. Creates the series + episodes DynamoDB tables (matching the CDK schema).
 *   2. Seeds them with the canonical SEED_SERIES / SEED_EPISODES data.
 *
 * Run against DynamoDB Local:
 *   DYNAMODB_ENDPOINT=http://localhost:8000 \
 *   AWS_REGION=us-east-1 \
 *   SERIES_TABLE=firexp-dev-series \
 *   EPISODES_TABLE=firexp-dev-episodes \
 *   npx ts-node -r tsconfig-paths/register scripts/dynamo-init.ts
 *
 * Run against real AWS (prod — uses default SDK credential chain, no endpoint):
 *   AWS_REGION=us-east-1 \
 *   SERIES_TABLE=firexp-prod-series \
 *   EPISODES_TABLE=firexp-prod-episodes \
 *   npx ts-node -r tsconfig-paths/register scripts/dynamo-init.ts
 */

import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  BillingMode,
  KeyType,
  ScalarAttributeType,
  ProjectionType,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { SeriesItem } from '../src/orm/entities/series.entity';
import type { EpisodeItem } from '../src/orm/entities/episode.entity';
import { SEED_SERIES, SEED_EPISODES } from '../src/seed/seed-data';

// ── Config from environment ───────────────────────────────────────────────────

const REGION         = process.env['AWS_REGION']         ?? 'us-east-1';
const ENDPOINT       = process.env['DYNAMODB_ENDPOINT'];  // undefined = real AWS
const SERIES_TABLE   = process.env['SERIES_TABLE']        ?? 'firexp-dev-series';
const EPISODES_TABLE = process.env['EPISODES_TABLE']      ?? 'firexp-dev-episodes';
const SESSIONS_TABLE = process.env['SESSIONS_TABLE']      ?? 'firexp-dev-sessions';

// ── Build clients ─────────────────────────────────────────────────────────────

const rawClient = ENDPOINT
  ? new DynamoDBClient({
      region:   REGION,
      endpoint: ENDPOINT,
      credentials: {
        accessKeyId:     'local',
        secretAccessKey: 'local',
      },
    })
  : new DynamoDBClient({ region: REGION });

const docClient = DynamoDBDocumentClient.from(rawClient, {
  marshallOptions:   { removeUndefinedValues: true, convertEmptyValues: false },
  unmarshallOptions: { wrapNumbers: false },
});

// ── Table helpers ─────────────────────────────────────────────────────────────

async function tableExists(tableName: string): Promise<boolean> {
  try {
    const res = await rawClient.send(new DescribeTableCommand({ TableName: tableName }));
    return res.Table?.TableStatus === 'ACTIVE';
  } catch {
    return false;
  }
}

/** Poll until the table reaches ACTIVE status (real DynamoDB can take a few seconds). */
async function waitForActive(tableName: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await rawClient.send(new DescribeTableCommand({ TableName: tableName }));
      if (res.Table?.TableStatus === 'ACTIVE') return;
    } catch {
      // still creating
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for table ${tableName} to become ACTIVE`);
}

async function createSeriesTable(): Promise<void> {
  const tableName = SERIES_TABLE;

  if (await tableExists(tableName)) {
    console.log(`  [skip] ${tableName} already exists`);
    return;
  }

  console.log(`  [create] ${tableName} ...`);
  try {
    await rawClient.send(new CreateTableCommand({
      TableName: tableName,
      AttributeDefinitions: [
        { AttributeName: 'id', AttributeType: ScalarAttributeType.S },
      ],
      KeySchema: [
        { AttributeName: 'id', KeyType: KeyType.HASH },
      ],
      BillingMode: BillingMode.PAY_PER_REQUEST,
    }));
  } catch (err) {
    if ((err as { name?: string }).name === 'ResourceInUseException') {
      console.log(`  [skip] ${tableName} already exists (race)`);
      return;
    }
    throw err;
  }

  await waitForActive(tableName);
  console.log(`  [ok] ${tableName} created`);
}

async function createEpisodesTable(): Promise<void> {
  const tableName = EPISODES_TABLE;

  if (await tableExists(tableName)) {
    console.log(`  [skip] ${tableName} already exists`);
    return;
  }

  console.log(`  [create] ${tableName} ...`);
  try {
    await rawClient.send(new CreateTableCommand({
      TableName: tableName,
      AttributeDefinitions: [
        { AttributeName: 'id',       AttributeType: ScalarAttributeType.S },
        { AttributeName: 'seriesId', AttributeType: ScalarAttributeType.S },
        { AttributeName: 'number',   AttributeType: ScalarAttributeType.N },
      ],
      KeySchema: [
        { AttributeName: 'id', KeyType: KeyType.HASH },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'seriesId-number-index',
          KeySchema: [
            { AttributeName: 'seriesId', KeyType: KeyType.HASH },
            { AttributeName: 'number',   KeyType: KeyType.RANGE },
          ],
          Projection: { ProjectionType: ProjectionType.ALL },
        },
      ],
      BillingMode: BillingMode.PAY_PER_REQUEST,
    }));
  } catch (err) {
    if ((err as { name?: string }).name === 'ResourceInUseException') {
      console.log(`  [skip] ${tableName} already exists (race)`);
      return;
    }
    throw err;
  }

  await waitForActive(tableName);
  console.log(`  [ok] ${tableName} created`);
}

async function createSessionsTable(): Promise<void> {
  const tableName = SESSIONS_TABLE;

  if (await tableExists(tableName)) {
    console.log(`  [skip] ${tableName} already exists`);
    return;
  }

  console.log(`  [create] ${tableName} ...`);
  try {
    await rawClient.send(new CreateTableCommand({
      TableName: tableName,
      AttributeDefinitions: [
        { AttributeName: 'PK',        AttributeType: ScalarAttributeType.S },
        { AttributeName: 'SK',        AttributeType: ScalarAttributeType.S },
        { AttributeName: 'episodeId', AttributeType: ScalarAttributeType.S },
        { AttributeName: 'startedAt', AttributeType: ScalarAttributeType.S },
      ],
      KeySchema: [
        { AttributeName: 'PK', KeyType: KeyType.HASH },
        { AttributeName: 'SK', KeyType: KeyType.RANGE },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'byEpisode',
          KeySchema: [
            { AttributeName: 'episodeId', KeyType: KeyType.HASH },
            { AttributeName: 'startedAt', KeyType: KeyType.RANGE },
          ],
          Projection: { ProjectionType: ProjectionType.ALL },
        },
      ],
      BillingMode: BillingMode.PAY_PER_REQUEST,
    }));
  } catch (err) {
    if ((err as { name?: string }).name === 'ResourceInUseException') {
      console.log(`  [skip] ${tableName} already exists (race)`);
      return;
    }
    throw err;
  }

  await waitForActive(tableName);
  console.log(`  [ok] ${tableName} created`);
}

// ── Seed helpers ──────────────────────────────────────────────────────────────

async function seedSeries(): Promise<void> {
  const now = new Date().toISOString();
  let seeded = 0;

  for (const s of SEED_SERIES) {
    const item: SeriesItem = {
      id:           s.id,
      title:        s.title,
      description:  s.description,
      category:     s.category ?? '',
      thumbnailUrl: s.thumbnailUrl,
      episodes:     s.episodes,
      createdAt:    now,
      updatedAt:    now,
    };

    await docClient.send(new PutCommand({
      TableName: SERIES_TABLE,
      Item:      item,
      // Idempotent: only write if item does not exist yet so manual edits survive
      ConditionExpression: 'attribute_not_exists(id)',
    })).catch((err: unknown) => {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
        console.log(`  [skip] series ${s.id} already seeded`);
        return;
      }
      throw err;
    });

    console.log(`  [put] series ${s.id} — ${s.title}`);
    seeded++;
  }

  console.log(`  Seeded ${seeded} / ${SEED_SERIES.length} series`);
}

async function seedEpisodes(): Promise<void> {
  const now = new Date().toISOString();
  let seeded = 0;

  for (const e of SEED_EPISODES) {
    const item: EpisodeItem = {
      id:            e.id,
      seriesId:      e.seriesId,
      number:        e.number,
      title:         e.title,
      video:         e.video,
      questionnaire: e.questionnaire,
      flags:         e.flags,
      chapters:      e.chapters,
      createdAt:     now,
      updatedAt:     now,
    };

    await docClient.send(new PutCommand({
      TableName: EPISODES_TABLE,
      Item:      item,
      ConditionExpression: 'attribute_not_exists(id)',
    })).catch((err: unknown) => {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
        console.log(`  [skip] episode ${e.id} already seeded`);
        return;
      }
      throw err;
    });

    console.log(`  [put] episode ${e.id} — ${e.title}`);
    seeded++;
  }

  console.log(`  Seeded ${seeded} / ${SEED_EPISODES.length} episodes`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('dynamo-init starting');
  console.log(`  endpoint : ${ENDPOINT ?? '(AWS default chain)'}`);
  console.log(`  region   : ${REGION}`);
  console.log(`  series   : ${SERIES_TABLE}`);
  console.log(`  episodes : ${EPISODES_TABLE}`);
  console.log(`  sessions : ${SESSIONS_TABLE}`);
  console.log('');

  console.log('1. Creating tables...');
  await createSeriesTable();
  await createEpisodesTable();
  await createSessionsTable();

  console.log('');
  console.log('2. Seeding series...');
  await seedSeries();

  console.log('');
  console.log('3. Seeding episodes...');
  await seedEpisodes();

  console.log('');
  console.log('dynamo-init done.');
}

main().catch((err) => {
  console.error('dynamo-init failed:', err);
  process.exit(1);
});
