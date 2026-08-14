import { inject, InjectorToken } from "@/infrastructure/di";
import { AsyncResult } from "@/infrastructure/result";

import { InternalObsidianAppToken, InternalPluginToken } from "../../internal/tokens";
import { TrackedInstances } from "../../internal/tracked-instances";
import { ModalCancelled } from "../errors";

import { VueModalHost } from "./vue-modal-host";

import type { ModalDefinition } from "../types";

function dismissHost(host: VueModalHost<unknown, unknown>): void {
  host.dismiss();
}

export class ModalService {
  readonly #plugin = inject(InternalPluginToken);
  readonly #app = inject(InternalObsidianAppToken);
  readonly #injector = inject(InjectorToken);
  readonly #open = new TrackedInstances<VueModalHost<unknown, unknown>>(this.#plugin, dismissHost);

  open<TProps, TResult>(
    definition: ModalDefinition<TProps, TResult>,
    props: TProps,
  ): AsyncResult<TResult, ModalCancelled> {
    const { promise, resolve, reject } = Promise.withResolvers<TResult>();
    const host = new VueModalHost<TProps, TResult>(this.#app, this.#injector, definition, props, (outcome) => {
      if (outcome.kind === "submit") {
        resolve(outcome.value);
      } else {
        reject(new ModalCancelled());
      }
    });
    this.#open.add(host as unknown as VueModalHost<unknown, unknown>);
    host.onAfterClose = () => this.#open.delete(host as unknown as VueModalHost<unknown, unknown>);
    host.open();
    return AsyncResult.fromPromise(promise, (cause) =>
      cause instanceof ModalCancelled ? cause : new ModalCancelled(),
    );
  }
}
