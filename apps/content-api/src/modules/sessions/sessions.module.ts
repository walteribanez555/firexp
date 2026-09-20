import { Hono } from 'hono';
import { config, createLogger } from '../../config';
import { handleException, NotFoundException, BadRequestException } from '../../common/exceptions';
import type { AppEnv } from '../../app.types';
import type { ISessionsRepository } from './sessions.repository';
import { SessionsMemoryRepository } from './sessions.memory.repository';
import { SessionsDynamoRepository } from './sessions.dynamo.repository';

const logger = createLogger('SessionsModule');

// ── Repository factory ────────────────────────────────────────────────────────

let _repo: ISessionsRepository | null = null;

export function getSessionsRepo(): ISessionsRepository {
  if (!_repo) {
    const mode = config.getValue('storage');
    logger.info(`Using ${mode} storage for sessions`);
    _repo = mode === 'dynamo'
      ? new SessionsDynamoRepository()
      : new SessionsMemoryRepository();
  }
  return _repo;
}

/** Override repo — used in tests to inject in-memory instance. */
export function setSessionsRepo(repo: ISessionsRepository): void {
  _repo = repo;
}

// ── Bedrock recap helper ──────────────────────────────────────────────────────

async function generateRecap(roomCode: string, decisions: { decisionId: string; chosen: string; ts: number }[]): Promise<string> {
  try {
    const { BedrockRuntimeClient, ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime');
    const client = new BedrockRuntimeClient({ region: config.getValue('awsRegion') });

    const decisionSummary = decisions
      .map((d, i) => `Decision ${i + 1} (${d.decisionId}): chose "${d.chosen}"`)
      .join(', ');

    const prompt = `You are writing a brief recap of an interactive story session. ` +
      `The room "${roomCode}" made these choices: ${decisionSummary}. ` +
      `Write exactly 3 sentences summarizing the path taken, in a dramatic narrative style.`;

    const res = await client.send(new ConverseCommand({
      modelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      inferenceConfig: { maxTokens: 200, temperature: 0.7 },
    }));

    const content = res.output?.message?.content;
    if (content && content[0] && 'text' in content[0]) {
      return content[0].text as string;
    }
    throw new Error('No text in Bedrock response');
  } catch (err) {
    logger.warn('Bedrock unavailable — using templated recap', { err: (err as Error).message });
    const chosen = decisions.map((d) => `"${d.chosen}"`).join(', ');
    return `Room ${roomCode} carved a unique path through the story, making ${decisions.length} key decision${decisions.length !== 1 ? 's' : ''}. ` +
      `The choices made were: ${chosen || 'none yet'}. ` +
      `Their collective journey shaped an ending unlike any other.`;
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

export const sessionsRouter = new Hono<AppEnv>();

// POST /api/v1/sessions
// Body: { roomCode, episodeId }
sessionsRouter.post('/', async (c) => {
  try {
    const body = await c.req.json<{ roomCode?: string; episodeId?: string }>();
    if (!body.roomCode)  throw new BadRequestException('roomCode is required');
    if (!body.episodeId) throw new BadRequestException('episodeId is required');

    const meta = await getSessionsRepo().createSession(body.roomCode, body.episodeId);
    return c.json({ data: meta }, 201);
  } catch (err) {
    return handleException(err, c);
  }
});

// POST /api/v1/sessions/:roomCode/decisions
// Body: { chapterId, decisionId, chosen, votes, flagsAfter }
sessionsRouter.post('/:roomCode/decisions', async (c) => {
  try {
    const roomCode = c.req.param('roomCode');
    const body = await c.req.json<{
      chapterId?:  string;
      decisionId?: string;
      chosen?:     string;
      votes?:      Record<string, number>;
      flagsAfter?: Record<string, number>;
    }>();

    if (!body.chapterId)  throw new BadRequestException('chapterId is required');
    if (!body.decisionId) throw new BadRequestException('decisionId is required');
    if (!body.chosen)     throw new BadRequestException('chosen is required');

    await getSessionsRepo().recordDecision({
      roomCode,
      chapterId:  body.chapterId,
      decisionId: body.decisionId,
      chosen:     body.chosen,
      votes:      body.votes ?? {},
      flagsAfter: body.flagsAfter ?? {},
      ts:         Date.now(),
    });

    return c.json({ data: { ok: true } });
  } catch (err) {
    return handleException(err, c);
  }
});

// POST /api/v1/sessions/:roomCode/recap
sessionsRouter.post('/:roomCode/recap', async (c) => {
  try {
    const roomCode = c.req.param('roomCode');

    const [meta, decisions] = await Promise.all([
      getSessionsRepo().getSession(roomCode),
      getSessionsRepo().getSessionDecisions(roomCode),
    ]);

    if (!meta) throw new NotFoundException(`Session not found for room ${roomCode}`);

    const recap = await generateRecap(roomCode, decisions.map((d) => ({
      decisionId: d.decisionId,
      chosen:     d.chosen,
      ts:         d.ts,
    })));

    return c.json({ data: { recap } });
  } catch (err) {
    return handleException(err, c);
  }
});
