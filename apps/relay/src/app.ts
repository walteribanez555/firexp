import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { config, createLogger } from './config';
import { roomsRouter }               from './modules/rooms/rooms.module';
import { promptsRouter }             from './modules/prompts/prompts.module';
import { seriesRouter, episodesRouter } from './modules/series/series.module';
import type { AppEnv } from './app.types';

const logger = createLogger('App');
const { origins, methods, headers } = config.getValue('cors');

export const app = new Hono<AppEnv>();

// ── CORS ──────────────────────────────────────────────────────────────────────

const corsOrigin = origins.length === 1 && origins[0] === '*'
  ? '*'
  : (origin: string) => (origins.includes(origin) ? origin : origins[0]);

app.use('*', cors({
  origin: corsOrigin,
  allowMethods: methods as string[],
  allowHeaders: headers,
  exposeHeaders: headers,
  credentials: true,
}));

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/', (c) => {
  logger.info('Root request');
  return c.json({ service: 'relay', status: 'ok' });
});

const v1 = new Hono<AppEnv>();

v1.get('/health', (c) => {
  logger.info('Health check');
  return c.json({ status: 'ok' });
});

v1.route('/rooms',    roomsRouter);
v1.route('/prompts',  promptsRouter);
v1.route('/series',   seriesRouter);
v1.route('/episodes', episodesRouter);

app.route('/api/v1', v1);

// ── Static (built phone client) ───────────────────────────────────────────────

app.use('/phone/*',  serveStatic({ root: './public' }));
app.use('/phone',    serveStatic({ path: './public/index.html' }));
app.use('/tv-sim/*', serveStatic({ root: './public' }));
app.use('/tv-sim',   serveStatic({ path: './public/tv-sim/index.html' }));

// Self-hosted test media (videos + thumbnails) served from ./public/{videos,images}
app.use('/videos/*', serveStatic({ root: './public' }));
app.use('/images/*', serveStatic({ root: './public' }));
