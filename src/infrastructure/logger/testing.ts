import type { Module } from "@/infrastructure/di";

import { LoggerFactory, LoggerFactoryToken } from "./factory";
import { LogLevelGate, LogLevelGateToken } from "./log-level-gate";
import { LogSinkMultiToken, type LogRecord, type LogSink } from "./types";

export class MemorySink implements LogSink {
  readonly records: LogRecord[] = [];

  write(record: LogRecord): void {
    this.records.push(record);
  }
}

export function createLoggerTestingModule(): { module: Module; sink: MemorySink } {
  const sink = new MemorySink();
  const module: Module = {
    register(c) {
      c.register(LogSinkMultiToken).useValue(sink);
      c.register(LogLevelGateToken).useValue(new LogLevelGate("debug"));
      c.register(LoggerFactoryToken).useClass(LoggerFactory);
    },
  };
  return { module, sink };
}
