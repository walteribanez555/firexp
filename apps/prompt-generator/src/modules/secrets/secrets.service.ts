import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { config, createLogger } from '../../config';
import type { AppConfig, PromptMode } from '../../config';

const logger = createLogger('SecretsService');

/**
 * If SECRET_ID is set, fetch the JSON secret from AWS Secrets Manager and
 * merge recognised keys back into the app config.  Degrades gracefully on
 * any error so the service can still start without secrets access.
 */
export async function loadSecrets(): Promise<void> {
  const secretId = config.getValue('secretId');
  if (!secretId) return;

  const client = new SecretsManagerClient({ region: config.getValue('awsRegion') });

  try {
    const res = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
    const raw = res.SecretString;
    if (!raw) {
      logger.warn('Secret has no SecretString, skipping');
      return;
    }

    const parsed = JSON.parse(raw) as Record<string, string>;

    const overrides: Partial<AppConfig> = {};

    if (parsed['BEDROCK_MODEL_ID'])  overrides.bedrockModelId   = parsed['BEDROCK_MODEL_ID'];
    if (parsed['PROMPT_MODE'])       overrides.promptMode        = parsed['PROMPT_MODE'] as PromptMode;
    if (parsed['PROMPTS_TABLE'])     overrides.promptsTable      = parsed['PROMPTS_TABLE'];
    if (parsed['CACHE_TTL_SECONDS']) overrides.cacheTtlSeconds   = Number(parsed['CACHE_TTL_SECONDS']);

    config.merge(overrides);
    logger.info('Secrets loaded and merged', { keys: Object.keys(overrides) });
  } catch (err) {
    logger.warn('Failed to load secrets — continuing without them', err);
  }
}
