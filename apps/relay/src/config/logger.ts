import { config } from './config';
import type { ILogger } from './types';

class Logger implements ILogger {
  constructor(private readonly context: string = 'App') {}

  private format(level: string, message: string, data?: unknown): string {
    const ts    = new Date().toISOString();
    const extra = data ? ` | ${JSON.stringify(data)}` : '';
    return `[${ts}] [${level.toUpperCase()}] [${this.context}] ${message}${extra}`;
  }

  debug(message: string, data?: unknown): void {
    if (config.getValue('logLevel') === 'debug')
      console.log(this.format('debug', message, data));
  }

  info(message: string, data?: unknown): void {
    if (['debug', 'info'].includes(config.getValue('logLevel')))
      console.log(this.format('info', message, data));
  }

  warn(message: string, data?: unknown): void {
    if (['debug', 'info', 'warn'].includes(config.getValue('logLevel')))
      console.warn(this.format('warn', message, data));
  }

  error(message: string, error?: unknown): void {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(this.format('error', message, detail));
  }
}

export const createLogger = (context?: string): ILogger => new Logger(context);
export default Logger;
