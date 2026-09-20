export enum Environment {
  DEVELOPMENT = 'development',
  STAGING     = 'staging',
  PRODUCTION  = 'production',
}

export interface AppConfig {
  environment: Environment;
  debug: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  port: number;
  cors: {
    origins: string[];
    methods: string[];
    headers: string[];
  };
}

class Config {
  private static instance: Config;
  private config: AppConfig;

  private constructor() {
    this.config = this.loadConfig();
  }

  static getInstance(): Config {
    if (!Config.instance) Config.instance = new Config();
    return Config.instance;
  }

  private loadConfig(): AppConfig {
    const env   = (process.env.NODE_ENV || 'development') as Environment;
    const debug = process.env.DEBUG === 'true';

    const base: AppConfig = {
      environment: env,
      debug,
      logLevel: debug ? 'debug' : 'info',
      port: Number(process.env.PORT) || 3001,
      cors: {
        origins: ['*'],
        methods: ['GET', 'POST', 'OPTIONS'],
        headers: ['Content-Type'],
      },
    };

    return { ...base, ...this.getEnvironmentConfig(env) };
  }

  private getEnvironmentConfig(env: Environment): Partial<AppConfig> {
    switch (env) {
      case Environment.PRODUCTION:
        return {
          debug: false,
          logLevel: 'warn',
          cors: {
            origins: process.env.CORS_ORIGINS?.split(',') || [],
            methods: ['GET', 'POST'],
            headers: ['Content-Type'],
          },
        };
      case Environment.STAGING:
        return { debug: true, logLevel: 'info' };
      default:
        return { debug: true, logLevel: 'debug' };
    }
  }

  get(): AppConfig                              { return this.config; }
  getValue<K extends keyof AppConfig>(key: K)   { return this.config[key]; }
  isDevelopment() { return this.config.environment === Environment.DEVELOPMENT; }
  isProduction()  { return this.config.environment === Environment.PRODUCTION; }
  isStaging()     { return this.config.environment === Environment.STAGING; }
}

export const config = Config.getInstance();
export default config;
