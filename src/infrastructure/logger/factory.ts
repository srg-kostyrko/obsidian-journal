import { createToken, inject } from "@/infrastructure/di";

import { Logger } from "./logger";
import { LogSinkMultiToken } from "./types";

export class LoggerFactory {
  readonly #sinks = inject(LogSinkMultiToken);

  named(name: string): Logger {
    return new Logger(name, this.#sinks);
  }
}

export const LoggerFactoryToken = createToken<LoggerFactory>("LoggerFactory");
