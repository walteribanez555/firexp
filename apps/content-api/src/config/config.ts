export interface AppConfig {
  port:           number;
  awsRegion:      string;
  dynamoEndpoint: string | null;
  seriesTable:    string;
  episodesTable:  string;
  sessionsTable:  string;
  contentBucket:  string;
  cdnBase:        string | null;
  presignTtl:     number;
  storage:        'dynamo' | 'memory';
  logLevel:       'debug' | 'info' | 'warn' | 'error';
  nodeEnv:        string;
  cors: {
    origins: string[];
    methods: string[];
    headers: string[];
  };
}

function loadConfig(): AppConfig {
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  const isProd  = nodeEnv === 'production';

  const seriesTable    = process.env['SERIES_TABLE']   ?? 'firexp-dev-series';
  const episodesTable  = process.env['EPISODES_TABLE'] ?? 'firexp-dev-episodes';
  const sessionsTable  = process.env['SESSIONS_TABLE'] ?? 'firexp-dev-sessions';
  const contentBucket  = process.env['CONTENT_BUCKET'] ?? '';
  const dynamoEndpoint = process.env['DYNAMODB_ENDPOINT'] ?? null;

  // Storage mode:
  //   - explicit STORAGE=memory  → always memory (tests)
  //   - DYNAMODB_ENDPOINT set    → dynamo (local dev)
  //   - SERIES_TABLE + EPISODES_TABLE set → dynamo (prod / CI)
  //   - otherwise                → memory (safety fallback, no AWS configured)
  const explicitMemory = process.env['STORAGE'] === 'memory';
  const hasDynamo      = !!(dynamoEndpoint || (process.env['SERIES_TABLE'] && process.env['EPISODES_TABLE']));
  const storage: 'dynamo' | 'memory' = explicitMemory ? 'memory' : hasDynamo ? 'dynamo' : 'memory';

  return {
    port:           Number(process.env['PORT']) || 3003,
    awsRegion:      process.env['AWS_REGION'] ?? 'us-east-1',
    dynamoEndpoint,
    seriesTable,
    episodesTable,
    sessionsTable,
    contentBucket,
    cdnBase:        process.env['CDN_BASE'] ?? null,
    presignTtl:     Number(process.env['PRESIGN_TTL']) || 300,
    storage,
    logLevel:       isProd
                      ? 'warn'
                      : (process.env['LOG_LEVEL'] as AppConfig['logLevel']) ?? 'info',
    nodeEnv,
    cors: {
      origins: ['*'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      headers: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    },
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
}

export const config = Config.getInstance();
export default config;
