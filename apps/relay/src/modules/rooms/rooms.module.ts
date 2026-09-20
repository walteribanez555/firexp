import { Hono } from 'hono';
import { roomsService } from './rooms.service';
import { seriesService } from '../series/series.service';
import { twitchAdapter } from '../twitch/twitch.adapter';
import { NotFoundException, BadRequestException, handleException } from '../../common/exceptions';
import type { AppEnv } from '../../app.types';

export const roomsRouter = new Hono<AppEnv>();

// GET /api/v1/rooms  →  stats for all rooms (active + closed)
roomsRouter.get('/', (c) => {
  return c.json({ data: roomsService.allStats() });
});

// GET /api/v1/rooms/:code  →  full log + flags for one room
roomsRouter.get('/:code', (c) => {
  try {
    const code  = c.req.param('code').toUpperCase();
    const stats = roomsService.stats(code);
    if (!stats) throw new NotFoundException(`Room ${code} not found`);
    return c.json({ data: stats });
  } catch (err) {
    return handleException(err, c);
  }
});

// POST /api/v1/rooms/:code/whatif?at=cap2&option=0  →  projected alternative path
// (POST, not GET: the story graph is sent in the request body for projection)
roomsRouter.post('/:code/whatif', async (c) => {
  try {
    const code     = c.req.param('code').toUpperCase();
    const atChapter = c.req.query('at');
    const optionIdx = Number(c.req.query('option') ?? '0');

    if (!atChapter) throw new BadRequestException('Missing query param: at');

    // Story graph must be sent in the request body for projection
    const body = await c.req.json().catch(() => null) as { story?: unknown } | null;
    if (!body?.story) throw new BadRequestException('Missing body: { story: StoryGraph }');

    const path = roomsService.whatIf(code, atChapter, optionIdx, body.story as never);
    if (path === null) throw new NotFoundException(`Room ${code} or chapter ${atChapter} not found`);

    return c.json({ data: { projectedPath: path } });
  } catch (err) {
    return handleException(err, c);
  }
});

// POST /api/v1/rooms  →  create new room, optionally inheriting flags from another
roomsRouter.post('/', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})) as {
      code?: string;
      title?: string;
      inherit?: string;
    };

    const code  = (body.code ?? generateCode()).toUpperCase();
    const title = body.title ?? 'Historia';

    // Trigger room creation with optional inheritance
    roomsService.join(code, { readyState: 3 } as never, title, body.inherit);
    roomsService.leave({ readyState: 3 } as never);

    return c.json({ data: { code, title, inherited: body.inherit ?? null } }, 201);
  } catch (err) {
    return handleException(err, c);
  }
});

// POST /api/v1/rooms/:code/questionnaire
// Phone submits questionnaire answers → relay applies flags → broadcasts episode_start to TV
roomsRouter.post('/:code/questionnaire', async (c) => {
  try {
    const code = c.req.param('code').toUpperCase();
    const body = await c.req.json().catch(() => null) as {
      episodeId: string;
      answers:   { questionId: string; optionId: string }[];
    } | null;

    if (!body?.episodeId || !Array.isArray(body.answers)) {
      throw new BadRequestException('Missing required fields: episodeId, answers');
    }

    const episode = await seriesService.getEpisode(body.episodeId);
    if (!episode) throw new NotFoundException(`Episode ${body.episodeId} not found`);

    const { chapterId, flags } = roomsService.applyQuestionnaire(code, body.answers, episode);

    roomsService.broadcastAll(code, JSON.stringify({ type: 'episode_start', chapterId, flags }));

    return c.json({ data: { chapterId, flags } });
  } catch (err) {
    return handleException(err, c);
  }
});

// POST /api/v1/rooms/:code/twitch  { channel }
// Attach a Twitch channel to a room at runtime so its chat becomes audience votes.
// Optional feature — only affects this room; the relay is unchanged otherwise.
roomsRouter.post('/:code/twitch', async (c) => {
  try {
    const code = c.req.param('code').toUpperCase();
    const body = await c.req.json().catch(() => null) as { channel?: string } | null;
    if (!body?.channel || typeof body.channel !== 'string') {
      throw new BadRequestException('Missing body: { channel: string }');
    }

    const attached = twitchAdapter.attach(code, body.channel);
    if (!attached) throw new BadRequestException('Invalid Twitch channel');

    return c.json({ data: { code, channel: attached } });
  } catch (err) {
    return handleException(err, c);
  }
});

// DELETE /api/v1/rooms/:code/twitch  → detach + close the IRC socket for a room.
roomsRouter.delete('/:code/twitch', (c) => {
  try {
    const code = c.req.param('code').toUpperCase();
    twitchAdapter.detach(code);
    return c.json({ data: { code, detached: true } });
  } catch (err) {
    return handleException(err, c);
  }
});

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
