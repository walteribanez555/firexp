export type PromptMode = 'ai' | 'random' | 'static';

export interface AppConfig {
  port:              number;
  awsRegion:         string;
  bedrockModelId:    string;
  promptMode:        PromptMode;
  promptsTable:      string;
  secretId:          string | null;
  cacheTtlSeconds:   number;
  logLevel:          'debug' | 'info' | 'warn' | 'error';
  nodeEnv:           string;
}

function loadConfig(): AppConfig {
  const nodeEnv   = process.env.NODE_ENV ?? 'development';
  const isProd    = nodeEnv === 'production';

  return {
    port:            Number(process.env.PORT) || 3002,
    awsRegion:       process.env.AWS_REGION ?? 'us-east-1',
    bedrockModelId:  process.env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    promptMode:      (process.env.PROMPT_MODE ?? 'ai') as PromptMode,
    promptsTable:    process.env.PROMPTS_TABLE ?? 'fire-hack-prompts',
    secretId:        process.env.SECRET_ID ?? null,
    cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS) || 86400,
    logLevel:        isProd ? 'warn' : (process.env.LOG_LEVEL as AppConfig['logLevel']) ?? 'info',
    nodeEnv,
  };
}

class Config {
  private static instance: Config;
  private _config: AppConfig;

  private constructor() {
    this._config = loadConfig();
  }

  static getInstance(): Config {
    if (!Config.instance) Config.instance = new Config();
    return Config.instance;
  }

  get(): AppConfig { return this._config; }

  getValue<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this._config[key];
  }

  /** Merge overrides from Secrets Manager at startup */
  merge(overrides: Partial<AppConfig>): void {
    this._config = { ...this._config, ...overrides };
  }
}

export const config = Config.getInstance();
export default config;
