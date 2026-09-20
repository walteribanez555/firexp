import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { config, createLogger } from './config';
import { seriesRouter } from './modules/series/series.module';
import { episodesRouter, seriesEpisodesRouter } from './modules/episodes/episodes.module';
import { uploadsRouter } from './modules/uploads/uploads.module';
import { sessionsRouter } from './modules/sessions/sessions.module';
import type { AppEnv } from './app.types';

const logger = createLogger('App');
const { origins, methods, headers } = config.getValue('cors');

export const app = new Hono<AppEnv>();

// ── CORS ──────────────────────────────────────────────────────────────────────

const corsOrigin = origins.length === 1 && origins[0] === '*'
  ? '*'
  : (origin: string) => (origins.includes(origin) ? origin : origins[0]);

app.use('*', cors({
  origin:         corsOrigin,
  allowMethods:   methods as string[],
  allowHeaders:   headers,
  exposeHeaders:  headers,
  credentials:    true,
}));

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/', (c) => {
  logger.info('Root request');
  return c.json({ service: 'content-api', status: 'ok' });
});

const v1 = new Hono<AppEnv>();

v1.get('/health', (c) => {
  logger.info('Health check');
  return c.json({ status: 'ok' });
});

v1.route('/series',   seriesRouter);
v1.route('/series/:seriesId/episodes', seriesEpisodesRouter);
v1.route('/episodes', episodesRouter);
v1.route('/uploads',  uploadsRouter);
v1.route('/sessions', sessionsRouter);

app.route('/api/v1', v1);
