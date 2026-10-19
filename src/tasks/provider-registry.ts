import { inject } from "@/infrastructure/di";

import { TaskProviderToken } from "./types";

export class TaskProviderRegistry {
  readonly #providers = inject(TaskProviderToken);
  readonly #disposers: (() => void)[] = [];
  #resolveStarted: (() => void) | undefined;
  // Settles once every provider has started, not once every provider has filled: providers start
  // during onload, before layout-ready, and fill off the journals index — note-property walks the
  // vault only after JournalsIndex.whenReady. A caller needing filled items awaits that first, as
  // the API does; the fill registered its continuation at start(), so it runs ahead of the caller's.
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

  [Symbol.dispose](): void {
    for (const dispose of this.#disposers) dispose();
    this.#disposers.length = 0;
  }
}
