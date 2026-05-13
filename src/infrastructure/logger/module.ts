import type { Module } from "@/infrastructure/di";

import { ConsoleSink } from "./console-sink";
import { LoggerFactory, LoggerFactoryToken } from "./factory";
import { LogSinkMultiToken } from "./types";

export const LoggerModule: Module = {
  register(c) {
    c.register(LogSinkMultiToken).useClass(ConsoleSink);
    c.register(LoggerFactoryToken).useClass(LoggerFactory);
  },
};
