import { inject } from "@/infrastructure/di";

import { TaskProviderToken } from "./types";

export class TaskProviderRegistry {
  readonly #providers = inject(TaskProviderToken);
  readonly #disposers: (() => void)[] = [];
  #resolveStarted: (() => void) | undefined;
  // Each provider fills the task index synchronously from start(), so once this settles the index
  // answers for every owned note. It starts after the journals index is ready (see main.ts), which
  // on a plugin reload leaves a window where the journals index is ready and this index is empty.
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
