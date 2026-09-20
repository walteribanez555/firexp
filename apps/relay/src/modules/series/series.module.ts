import { Hono } from 'hono';
import { seriesService } from './series.service';
import { NotFoundException, handleException } from '../../common/exceptions';
import type { AppEnv } from '../../app.types';

export const seriesRouter = new Hono<AppEnv>();

// GET /api/v1/series
seriesRouter.get('/', async (c) => {
  return c.json({ data: await seriesService.list() });
});

// GET /api/v1/series/:id
seriesRouter.get('/:id', async (c) => {
  try {
    const series = await seriesService.getSeries(c.req.param('id'));
    if (!series) throw new NotFoundException('Series not found');
    return c.json({ data: series });
  } catch (err) {
    return handleException(err, c);
  }
});

// GET /api/v1/episodes/:id  (mounted separately in app.ts)
export const episodesRouter = new Hono<AppEnv>();

episodesRouter.get('/:id', async (c) => {
  try {
    const episode = await seriesService.getEpisode(c.req.param('id'));
    if (!episode) throw new NotFoundException('Episode not found');
    return c.json({ data: episode });
  } catch (err) {
    return handleException(err, c);
  }
});

// GET /api/v1/episodes/:id/stats  → proxied from content-api ("% of rooms chose X")
episodesRouter.get('/:id/stats', async (c) => {
  try {
    const stats = await seriesService.getEpisodeStats(c.req.param('id'));
    return c.json({ data: stats ?? { decisions: {} } });
  } catch (err) {
    return handleException(err, c);
  }
});
