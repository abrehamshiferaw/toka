import { UsageEvent } from './types';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';
export type LogFormat = 'json' | 'pretty';

export interface LoggerOptions {
  level?: LogLevel;
  format?: LogFormat;
  destination?: (message: string) => void;
}

const LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  silent: 5,
};

export class TokaLogger {
  private level: LogLevel;
  private format: LogFormat;
  private readonly destination: (message: string) => void;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? 'info';
    this.format = options.format ?? 'json';
    this.destination = options.destination ?? ((msg: string) => process.stdout.write(msg + '\n'));
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  setFormat(format: LogFormat): void {
    this.format = format;
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_SEVERITY[level] >= LEVEL_SEVERITY[this.level];
  }

  private write(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    if (this.format === 'json') {
      const payload = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...data,
      };
      this.destination(JSON.stringify(payload));
    } else {
      const time = new Date().toISOString().substring(11, 19);
      const tag = `[TOKA ${level.toUpperCase()}]`;
      const extra = data ? ` ${JSON.stringify(data)}` : '';
      this.destination(`${time} ${tag} ${message}${extra}`);
    }
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.write('debug', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.write('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.write('warn', message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.write('error', message, data);
  }

  logUsage(event: UsageEvent): void {
    if (!this.shouldLog('info')) return;

    const data: Record<string, unknown> = {
      eventId: event.id,
      model: event.model,
      actualModel: event.actualModel,
      totalTokens: event.tokens.total,
      cost: event.cost.totalCost,
      latencyMs: event.latencyMs,
      cacheHit: event.cacheHit,
      success: event.success,
    };

    if (event.agentContext?.agentId) data.agentId = event.agentContext.agentId;
    if (event.agentContext?.taskId) data.taskId = event.agentContext.taskId;
    if (event.agentContext?.stage) data.stage = event.agentContext.stage;
    if (event.agentContext?.repository) data.repository = event.agentContext.repository;

    this.info(`LLM call completed: ${event.actualModel} ($${event.cost.totalCost.toFixed(6)})`, data);
  }
}
