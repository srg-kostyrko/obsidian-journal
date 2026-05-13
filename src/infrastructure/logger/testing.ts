// src/infrastructure/logger/testing.ts
import type { LogRecord, LogSink } from "./types";

export class MemorySink implements LogSink {
  readonly records: LogRecord[] = [];

  write(record: LogRecord): void {
    this.records.push(record);
  }
}
