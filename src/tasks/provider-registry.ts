import { inject } from "@/infrastructure/di";

import { TaskProviderToken } from "./types";

export class TaskProviderRegistry {
  readonly #providers = inject(TaskProviderToken);
  readonly #disposers: (() => void)[] = [];
  #resolveStarted: (() => void) | undefined;
  // Settles once every provider has started, not once every provider has filled: providers start
  // during onload, before layout-ready, and fill off the journals index. A caller needing filled
  // items awaits whenFilled instead, as the API does.
  readonly #started = new Promise<void>((resolve) => {
    this.#resolveStarted = resolve;
  });

  initialize(): void {
    for (const provider of this.#providers) {
      this.#disposers.push(provider.start());
    }
    this.#resolveStarted?.();
  }

  whenStarted(): Promise<void> {
    return this.#started;
  }

  // A provider reporting no fill fills synchronously in the readiness continuation it registered at
  // start(), which runs ahead of any continuation a caller registers after this resolves.
  async whenFilled(): Promise<void> {
    await this.#started;
    await Promise.all(this.#providers.map((provider) => provider.whenFilled?.() ?? Promise.resolve()));
  }

  [Symbol.dispose](): void {
    for (const dispose of this.#disposers) dispose();
    this.#disposers.length = 0;
  }
}
