import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { config, createLogger } from '../../config';

const logger = createLogger('Bedrock');

export const bedrockClient = new BedrockRuntimeClient({
  region: config.getValue('awsRegion'),
});

export function getModelId(): string  { return config.getValue('bedrockModelId'); }
export function getPromptMode()       { return config.getValue('promptMode'); }

logger.debug('Bedrock prompt config', {
  modelId: getModelId(),
  mode:    getPromptMode(),
});
