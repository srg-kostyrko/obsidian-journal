import { inject, InjectorToken } from "@/infrastructure/di";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import type { AsyncResult } from "@/infrastructure/result";

import { UserAborted } from "./errors";

import type { Flow } from "./types";

export class Flows {
  readonly #logger = inject(LoggerFactoryToken).named("flows");
  readonly #injector = inject(InjectorToken);

  invoke<P, R, E>(cls: new () => Flow<P, R, E>, parameters: P): AsyncResult<R, E> {
    const name = cls.name;
    const started = performance.now();
    this.#logger.debug("flow started", { flow: name });

    return this.#injector
      .resolve(cls)
      .execute(parameters)
      .tap(() => {
        const ms = Math.round(performance.now() - started);
        this.#logger.info("flow completed", { flow: name, ms });
      })
      .tapErr((error) => {
        const ms = Math.round(performance.now() - started);
        if (error instanceof UserAborted) {
          this.#logger.info("flow aborted", { flow: name, ms, source: error.source });
        } else {
          this.#logger.error("flow failed", { flow: name, ms, error });
        }
      });
  }
}
