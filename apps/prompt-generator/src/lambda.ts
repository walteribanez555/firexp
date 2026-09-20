/**
 * Lambda entry point.
 *
 * Uses hono/aws-lambda `handle()` — the official Hono adapter that converts
 * an API Gateway v1 (REST API) / v2 (HTTP API) / ALB proxy event into a Fetch
 * Request, passes it through the Hono app, and converts the Hono Response
 * back into the Lambda proxy response shape.  The adapter auto-detects
 * whether the event is v1/v2 by inspecting the `version` field.
 *
 * Secrets are loaded once during the cold start (the module-level Promise)
 * so that subsequent invocations pay no latency on config loading.
 */
import type { LambdaContext } from 'hono/aws-lambda';
import { handle, type LambdaEvent } from 'hono/aws-lambda';
import { app } from './app';
import { loadSecrets } from './modules/secrets/secrets.service';
import { createLogger } from './config';

const logger = createLogger('Lambda');

// Module-level cold-start initialisation — awaited on every invocation so the
// very first request also benefits from secrets (resolved Promise is instant).
const ready: Promise<void> = loadSecrets().catch((err) => {
  logger.warn('Secrets load failed on cold start — continuing without them', err);
});

const _handler = handle(app);

export const handler = async (event: LambdaEvent, context?: LambdaContext) => {
  await ready;
  return _handler(event, context);
};
