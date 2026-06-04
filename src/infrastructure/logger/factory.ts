import { createToken, inject } from "@/infrastructure/di";

import { LogLevelGateToken } from "./log-level-gate";
import { Logger } from "./logger";
import { LogSinkMultiToken } from "./types";

export class LoggerFactory {
  readonly #sinks = inject(LogSinkMultiToken);
  readonly #gate = inject(LogLevelGateToken);

  named(name: string): Logger {
    return new Logger(name, this.#sinks, this.#gate);
  }
}

export const LoggerFactoryToken = createToken<LoggerFactory>("LoggerFactory");
