import type { Module } from "@/infrastructure/di";

import { BufferSink, BufferSinkToken } from "./buffer-sink";
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
      c.register(LogLevelGateToken).useClass(LogLevelGate);
      c.register(BufferSinkToken).useClass(BufferSink);
      c.register(LoggerFactoryToken).useClass(LoggerFactory);
    },
  };
  return { module, sink };
}
