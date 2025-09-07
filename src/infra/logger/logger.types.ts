export const LogLevel = {
  info: "info",
  warn: "warn",
  error: "error",
  debug: "debug",
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export interface LogRecord {
  level: LogLevel;
  message: string;
  info?: Record<string, unknown>;
  scope: string;
  timestamp: number;
}

export interface Logger {
  inScope(scope: string): this;

  debug(message: string, info?: Record<string, unknown>): void;
  info(message: string, info?: Record<string, unknown>): void;
  warn(message: string, info?: Record<string, unknown>): void;
  error(message: string, info?: Record<string, unknown>): void;
}

export interface LoggerService {
  log(logRecord: LogRecord): void;
  records(): LogRecord[];
  clear(): void;
}

export interface LoggerSettings {
  logLevel: LogLevel;
}
