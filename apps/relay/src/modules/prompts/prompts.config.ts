import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { createLogger } from '../../config';

const logger = createLogger('Bedrock');

export const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
});

export const BEDROCK_MODEL_ID =
  process.env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-sonnet-4-6';

export const PROMPT_MODE = (process.env.PROMPT_MODE ?? 'random') as 'ai' | 'random' | 'static';

logger.debug('Bedrock prompt config', { modelId: BEDROCK_MODEL_ID, mode: PROMPT_MODE });
