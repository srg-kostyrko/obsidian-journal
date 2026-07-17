import { m } from "@/i18n";
import { inject, InjectorToken } from "@/infrastructure/di";
import { NoticeService } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import type { AsyncResult } from "@/infrastructure/result";

import { isBenignFlowError, UserAborted } from "./errors";

import type { Flow } from "./types";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface FlowInvokeOptions {
  readonly context?: Record<string, unknown>;
  // Opt out only when the caller shows its own failure notice, or the notices double up.
  readonly notify?: boolean;
}

export class Flows {
  readonly #logger = inject(LoggerFactoryToken).named("flows");
  readonly #injector = inject(InjectorToken);
  readonly #notices = inject(NoticeService);

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
          // A flow's error would otherwise reach the user only through the returned
          // AsyncResult, which nearly every caller discards — so a real failure showed
          // nothing on screen at all. Notify by default; callers with a better message
          // of their own opt out.
          if (options?.notify !== false) {
            this.#notices.show(m.flow_failure_notice({ error: errorMessage(error) }));
          }
        }
      });
  }
}
