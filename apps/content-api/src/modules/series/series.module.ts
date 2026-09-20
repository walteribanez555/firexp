import { Hono } from 'hono';
import { config, createLogger } from '../../config';
import { handleException, NotFoundException, BadRequestException } from '../../common/exceptions';
import type { AppEnv } from '../../app.types';
import type { ISeriesRepository } from './series.repository';
import { SeriesMemoryRepository } from './series.memory.repository';
import { SeriesDynamoRepository } from './series.dynamo.repository';
import { generateCover } from '../covers/covers.service';

const logger = createLogger('SeriesModule');

// ── Repository factory (memory vs dynamo) ─────────────────────────────────────

let _repo: ISeriesRepository | null = null;

export function getSeriesRepo(): ISeriesRepository {
  if (!_repo) {
    const mode = config.getValue('storage');
    logger.info(`Using ${mode} storage for series`);
    _repo = mode === 'dynamo'
      ? new SeriesDynamoRepository()
      : new SeriesMemoryRepository();
  }
  return _repo;
}

/** Override repo — used in tests to inject in-memory instance. */
export function setSeriesRepo(repo: ISeriesRepository): void {
  _repo = repo;
}

// ── Router ────────────────────────────────────────────────────────────────────

export const seriesRouter = new Hono<AppEnv>();

// GET /api/v1/series
seriesRouter.get('/', async (c) => {
  try {
    const items = await getSeriesRepo().findAll();
    return c.json({ data: items });
  } catch (err) {
    return handleException(err, c);
  }
});

// GET /api/v1/series/:id
seriesRouter.get('/:id', async (c) => {
  try {
    const item = await getSeriesRepo().findById(c.req.param('id'));
    if (!item) throw new NotFoundException('Series not found');
    return c.json({ data: item });
  } catch (err) {
    return handleException(err, c);
  }
});

// POST /api/v1/series
seriesRouter.post('/', async (c) => {
  try {
    const body = await c.req.json<{ title?: string; description?: string; category?: string; thumbnailUrl?: string }>();
    if (!body.title)       throw new BadRequestException('title is required');
    if (!body.description) throw new BadRequestException('description is required');

    const item = await getSeriesRepo().create({
      title:        body.title,
      description:  body.description,
      category:     body.category ?? '',
      thumbnailUrl: body.thumbnailUrl ?? '',
    });
    return c.json({ data: item }, 201);
  } catch (err) {
    return handleException(err, c);
  }
});

// PUT /api/v1/series/:id
seriesRouter.put('/:id', async (c) => {
  try {
    const id   = c.req.param('id');
    const body = await c.req.json<{ title?: string; description?: string; category?: string; thumbnailUrl?: string }>();
    const item = await getSeriesRepo().update(id, body);
    if (!item) throw new NotFoundException('Series not found');
    return c.json({ data: item });
  } catch (err) {
    return handleException(err, c);
  }
});

// POST /api/v1/series/:id/cover
// Body (optional): { prompt?: string }
// Generates cover art with Amazon Nova Canvas, uploads it to the content bucket,
// updates the series thumbnailUrl to the CDN URL, and returns it.
seriesRouter.post('/:id/cover', async (c) => {
  try {
    const id = c.req.param('id');

    const series = await getSeriesRepo().findById(id);
    if (!series) throw new NotFoundException('Series not found');

    let prompt: string | undefined;
    try {
      const body = await c.req.json<{ prompt?: string }>();
      prompt = body?.prompt;
    } catch {
      // No/invalid JSON body — prompt is optional.
    }

    const cover = await generateCover({
      id,
      prompt,
      title:       series.title,
      description: series.description,
      kind:        'covers',
    });

    // Persist the new thumbnail only when a real image was produced+uploaded.
    let thumbnailUrl = series.thumbnailUrl;
    if (cover.uploaded) {
      const updated = await getSeriesRepo().update(id, { thumbnailUrl: cover.url });
      thumbnailUrl = updated?.thumbnailUrl ?? cover.url;
    }

    return c.json({
      data: {
        thumbnailUrl,
        coverUrl:  cover.url,
        generated: cover.generated,
        uploaded:  cover.uploaded,
      },
    });
  } catch (err) {
    return handleException(err, c);
  }
});

// DELETE /api/v1/series/:id
seriesRouter.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const ok = await getSeriesRepo().delete(id);
    if (!ok) throw new NotFoundException('Series not found');
    return c.json({ data: { id } });
  } catch (err) {
    return handleException(err, c);
  }
});
