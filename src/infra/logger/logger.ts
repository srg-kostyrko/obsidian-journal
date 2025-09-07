import { deepCopy } from "@/utils/misc";

import type { Logger as LoggerContract } from "./logger.types";
import { Injectable } from "../di/decorators/Injectable";
import { Scoped } from "../di/decorators/Scoped";

import { LoggerService, Logger as LoggerToken } from "./logger.tokens";
import { Scope } from "../di/contracts/scope.types";
import { inject } from "../di/inject";

export
@Injectable(LoggerToken)
@Scoped(Scope.Transient)
class Logger implements LoggerContract {
  #logger = inject(LoggerService);
  #scope = "";

  inScope(scope: string): this {
    this.#scope = scope;
    return this;
  }

  debug(message: string, info?: Record<string, unknown>): void {
    this.#logger.log({ level: "debug", message, info: deepCopy(info), scope: this.#scope, timestamp: Date.now() });
  }

  info(message: string, info?: Record<string, unknown>): void {
    this.#logger.log({ level: "info", message, info: deepCopy(info), scope: this.#scope, timestamp: Date.now() });
  }

  warn(message: string, info?: Record<string, unknown>): void {
    this.#logger.log({ level: "warn", message, info: deepCopy(info), scope: this.#scope, timestamp: Date.now() });
  }
  error(message: string, info?: Record<string, unknown>): void {
    this.#logger.log({ level: "error", message, info: deepCopy(info), scope: this.#scope, timestamp: Date.now() });
  }
}
