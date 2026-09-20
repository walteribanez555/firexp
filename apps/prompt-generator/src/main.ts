try { process.loadEnvFile('.env'); } catch { /* .env is optional */ }

import { serve } from '@hono/node-server';
import { app } from './app';
import { config, createLogger } from './config';
import { loadSecrets } from './modules/secrets/secrets.service';

const logger = createLogger('Server');

async function bootstrap(): Promise<void> {
  // Load secrets first so config overrides are in place before routes handle requests
  await loadSecrets();

  const PORT = config.getValue('port');

  serve({ fetch: app.fetch, port: PORT }, (info) => {
    logger.info(`prompt-generator listening on port ${info.port}`, {
      mode:    config.getValue('promptMode'),
      modelId: config.getValue('bedrockModelId'),
    });
  });
}

bootstrap().catch((err) => {
  console.error('[Fatal] Bootstrap failed', err);
  process.exit(1);
});
