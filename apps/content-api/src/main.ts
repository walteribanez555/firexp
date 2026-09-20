/**
 * Entry point for local development (Node.js HTTP server).
 */
try { process.loadEnvFile('.env'); } catch { /* .env is optional */ }

import { serve } from '@hono/node-server';
import { app } from './app';
import { config, createLogger } from './config';

const logger = createLogger('Server');
const PORT   = config.getValue('port');

serve({ fetch: app.fetch, port: PORT }, (info) => {
  logger.info(`content-api listening on port ${info.port}`, {
    storage: config.getValue('storage'),
    region:  config.getValue('awsRegion'),
  });
});
