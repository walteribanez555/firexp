/**
 * Lambda entry point.
 *
 * Uses hono/aws-lambda `handle()` — the Hono adapter that converts an
 * API Gateway v1/v2 or ALB proxy event into a Fetch Request, passes it
 * through the Hono app, and converts the Response back into the Lambda
 * proxy response shape.
 *
 * The repository singletons are initialized on first request (lazy), so
 * there is no blocking async work during the cold start.
 */
import type { LambdaContext } from 'hono/aws-lambda';
import { handle, type LambdaEvent } from 'hono/aws-lambda';
import { app } from './app';

const _handler = handle(app);

export const handler = async (event: LambdaEvent, context?: LambdaContext) => {
  return _handler(event, context);
};
