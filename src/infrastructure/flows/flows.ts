import { inject, InjectorToken } from "@/infrastructure/di";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import type { AsyncResult } from "@/infrastructure/result";

import { isBenignFlowError, UserAborted } from "./errors";

import type { Flow } from "./types";

export interface FlowInvokeOptions {
  readonly context?: Record<string, unknown>;
}

export class Flows {
  readonly #logger = inject(LoggerFactoryToken).named("flows");
  readonly #injector = inject(InjectorToken);

  invoke<R, E>(cls: new () => Flow<void, R, E>, options?: FlowInvokeOptions): AsyncResult<R, E>;
  invoke<P, R, E>(cls: new () => Flow<P, R, E>, parameters: P, options?: FlowInvokeOptions): AsyncResult<R, E>;
  invoke<P, R, E>(cls: new () => Flow<P, R, E>, parameters?: P, options?: FlowInvokeOptions): AsyncResult<R, E> {
    const name = cls.name;
    const context = options?.context ?? {};
    const started = performance.now();
    this.#logger.debug("flow started", { flow: name, ...context });

    return this.#injector
      .resolve(cls)
      .execute(parameters as P)
      .tap(() => {
        const ms = Math.round(performance.now() - started);
        this.#logger.info("flow completed", { flow: name, ms, ...context });
      })
      .tapErr((error) => {
        const ms = Math.round(performance.now() - started);
        const fields = { flow: name, ms, ...context };
        if (error instanceof UserAborted) {
          this.#logger.info("flow aborted", { ...fields, source: error.source });
        } else if (isBenignFlowError(error)) {
          this.#logger.info("flow ended (benign)", { ...fields, error });
        } else {
          this.#logger.error("flow failed", { ...fields, error });
        }
      });
  }
}
