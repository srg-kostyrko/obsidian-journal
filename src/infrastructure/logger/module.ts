import { inject, type Module } from "@/infrastructure/di";

import { BufferSink, BufferSinkToken } from "./buffer-sink";
import { ConsoleSink } from "./console-sink";
import { LoggerFactory, LoggerFactoryToken } from "./factory";
import { LogLevelGate, LogLevelGateToken } from "./log-level-gate";
import { LogSinkMultiToken } from "./types";

export const LoggerModule: Module = {
  register(c) {
    c.register(LogLevelGateToken).useClass(LogLevelGate);
    c.register(BufferSinkToken).useClass(BufferSink);
    c.register(LogSinkMultiToken).useFactory(() => inject(BufferSinkToken));
    c.register(LogSinkMultiToken).useClass(ConsoleSink);
    c.register(LoggerFactoryToken).useClass(LoggerFactory);
  },
};
