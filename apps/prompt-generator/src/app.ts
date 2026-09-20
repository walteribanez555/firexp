import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { promptsRouter } from './modules/prompts/prompts.module';
import { createLogger } from './config';

const logger = createLogger('App');

export const app = new Hono();

// ── CORS ──────────────────────────────────────────────────────────────────────

app.use('*', cors({
  origin:         '*',
  allowMethods:   ['GET', 'POST', 'OPTIONS'],
  allowHeaders:   ['Content-Type'],
  exposeHeaders:  ['Content-Type'],
  credentials:    false,
}));

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/health', (c) => {
  logger.info('Health check');
  return c.json({ status: 'ok', service: 'prompt-generator' });
});

// ── Routes ────────────────────────────────────────────────────────────────────

app.route('/', promptsRouter);
