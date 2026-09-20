import { Hono } from 'hono';
import { config, createLogger } from '../../config';
import { handleException, NotFoundException, BadRequestException } from '../../common/exceptions';
import type { AppEnv } from '../../app.types';
import type { IEpisodesRepository } from './episodes.repository';
import { EpisodesMemoryRepository } from './episodes.memory.repository';
import { EpisodesDynamoRepository } from './episodes.dynamo.repository';
import { getSeriesRepo } from '../series/series.module';
import { getSessionsRepo } from '../sessions/sessions.module';
import { generateCover } from '../covers/covers.service';
import { validateEpisode } from '@fire-stick/story-graph';

const logger = createLogger('EpisodesModule');

// ── Repository factory ────────────────────────────────────────────────────────

let _repo: IEpisodesRepository | null = null;

export function getEpisodesRepo(): IEpisodesRepository {
  if (!_repo) {
    const mode = config.getValue('storage');
    logger.info(`Using ${mode} storage for episodes`);
    _repo = mode === 'dynamo'
      ? new EpisodesDynamoRepository()
      : new EpisodesMemoryRepository();
  }
  return _repo;
}

/** Override repo — used in tests to inject in-memory instance. */
export function setEpisodesRepo(repo: IEpisodesRepository): void {
  _repo = repo;
}

// ── Router ────────────────────────────────────────────────────────────────────

export const episodesRouter = new Hono<AppEnv>();

// GET /api/v1/episodes/:id
episodesRouter.get('/:id', async (c) => {
  try {
    const item = await getEpisodesRepo().findById(c.req.param('id'));
    if (!item) throw new NotFoundException('Episode not found');
    return c.json({ data: item });
  } catch (err) {
    return handleException(err, c);
  }
});

// PUT /api/v1/episodes/:id
episodesRouter.put('/:id', async (c) => {
  try {
    const id      = c.req.param('id');
    const body    = await c.req.json();

    // Validate the episode graph (if chapters/variants/decisions are present)
    const existing = await getEpisodesRepo().findById(id);
    if (!existing) throw new NotFoundException('Episode not found');

    const candidate = { ...existing, ...body };
    const vr = validateEpisode(candidate);
    const errors   = vr.issues.filter((i) => i.severity === 'error');
    const warnings = vr.issues.filter((i) => i.severity === 'warning');

    if (!vr.ok && errors.length > 0) {
      return c.json({ error: 'Episode graph is invalid', code: 'INVALID_GRAPH', issues: errors }, 422);
    }

    const item = await getEpisodesRepo().update(id, body);
    if (!item) throw new NotFoundException('Episode not found');

    // Keep series.episodes stub in sync
    await getSeriesRepo().syncEpisode(item.seriesId, {
      id:           item.id,
      number:       item.number,
      title:        item.title,
      thumbnailUrl: '',
    }).catch(() => { /* best-effort */ });

    return c.json({ data: item, ...(warnings.length > 0 ? { warnings } : {}) });
  } catch (err) {
    return handleException(err, c);
  }
});

// GET /api/v1/episodes/:id/stats
// Phone-facing contract: { data: { decisions: { [decisionId]: { total, options: { [optionId]: { count, pct } } } } } }
episodesRouter.get('/:id/stats', async (c) => {
  try {
    const id = c.req.param('id');
    const stats = await getSessionsRepo().getEpisodeStats(id);
    return c.json({ data: stats });
  } catch (err) {
    return handleException(err, c);
  }
});

// POST /api/v1/episodes/:id/cover
// Body (optional): { prompt?: string }
// Generates episode cover art with Amazon Nova Canvas, uploads it, and syncs the
// thumbnail into the parent series.episodes stub. Returns the CDN URL.
episodesRouter.post('/:id/cover', async (c) => {
  try {
    const id = c.req.param('id');

    const episode = await getEpisodesRepo().findById(id);
    if (!episode) throw new NotFoundException('Episode not found');

    let prompt: string | undefined;
    try {
      const body = await c.req.json<{ prompt?: string }>();
      prompt = body?.prompt;
    } catch {
      // Optional body.
    }

    const cover = await generateCover({
      id,
      prompt,
      title: episode.title,
      kind:  'episode-covers',
    });

    // Sync the new thumbnail into the series.episodes stub (best-effort).
    if (cover.uploaded) {
      await getSeriesRepo().syncEpisode(episode.seriesId, {
        id:           episode.id,
        number:       episode.number,
        title:        episode.title,
        thumbnailUrl: cover.url,
      }).catch(() => { /* best-effort */ });
    }

    return c.json({
      data: {
        thumbnailUrl: cover.url,
        coverUrl:     cover.url,
        generated:    cover.generated,
        uploaded:     cover.uploaded,
      },
    });
  } catch (err) {
    return handleException(err, c);
  }
});

// DELETE /api/v1/episodes/:id
episodesRouter.delete('/:id', async (c) => {
  try {
    const id      = c.req.param('id');
    const episode = await getEpisodesRepo().findById(id);
    if (!episode) throw new NotFoundException('Episode not found');

    const ok = await getEpisodesRepo().delete(id);
    if (!ok) throw new NotFoundException('Episode not found');

    // Remove from series.episodes stub
    await getSeriesRepo().removeEpisode(episode.seriesId, id).catch(() => { /* best-effort */ });

    return c.json({ data: { id } });
  } catch (err) {
    return handleException(err, c);
  }
});

// ── Series sub-resource: POST /api/v1/series/:seriesId/episodes ───────────────

export const seriesEpisodesRouter = new Hono<AppEnv>();

seriesEpisodesRouter.post('/', async (c) => {
  try {
    const seriesId = c.req.param('seriesId') ?? '';
    const series   = await getSeriesRepo().findById(seriesId);
    if (!series) throw new NotFoundException('Series not found');

    const body = await c.req.json<{
      number?:        number;
      title?:         string;
      questionnaire?: unknown;
      flags?:         unknown;
      chapters?:      unknown;
      video?:         string;
    }>();

    if (!body.title) throw new BadRequestException('title is required');

    // Episode number is assigned automatically and is unique within the series:
    // next = max(existing numbers) + 1. Any client-provided number is ignored.
    const existing   = await getEpisodesRepo().findBySeriesId(seriesId);
    const nextNumber = existing.reduce((max, e) => Math.max(max, e.number ?? 0), 0) + 1;

    // Build the candidate episode for validation (needs a temporary id + seriesId)
    if (body.chapters || body.flags) {
      const candidate = {
        id:            '__new__',
        seriesId,
        number:        nextNumber,
        title:         body.title,
        video:         body.video ?? '',
        questionnaire: body.questionnaire ?? [],
        flags:         body.flags ?? {},
        chapters:      body.chapters ?? [],
      };
      const vr     = validateEpisode(candidate);
      const errors = vr.issues.filter((i) => i.severity === 'error');
      if (!vr.ok && errors.length > 0) {
        return c.json({ error: 'Episode graph is invalid', code: 'INVALID_GRAPH', issues: errors }, 422);
      }
    }

    const episode = await getEpisodesRepo().create({
      seriesId:      seriesId,
      number:        nextNumber,
      title:         body.title,
      video:         body.video,
      questionnaire: body.questionnaire as never,
      flags:         body.flags as never,
      chapters:      body.chapters as never,
    });

    // Sync stub back into series.episodes
    await getSeriesRepo().syncEpisode(episode.seriesId, {
      id:           episode.id,
      number:       episode.number,
      title:        episode.title,
      thumbnailUrl: '',
    }).catch(() => { /* best-effort */ });

    return c.json({ data: episode }, 201);
  } catch (err) {
    return handleException(err, c);
  }
});
