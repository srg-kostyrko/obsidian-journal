// src/infrastructure/logger/types.ts
import { createMultiToken } from "@/infrastructure/di";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type Fields = Readonly<Record<string, unknown>>;

export interface LogRecord {
  readonly timestamp: number;
  readonly level: LogLevel;
  readonly name: string;
  readonly message: string;
  readonly fields?: Fields;
}

export interface LogSink {
  write(record: LogRecord): void;
}

export const LogSinkMultiToken = createMultiToken<LogSink>("LogSink");
