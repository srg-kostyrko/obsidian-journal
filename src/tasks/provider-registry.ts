import { inject } from "@/infrastructure/di";

import { TaskProviderToken } from "./types";

export class TaskProviderRegistry {
  readonly #providers = inject(TaskProviderToken);
  readonly #disposers: (() => void)[] = [];

  initialize(): void {
    for (const provider of this.#providers) {
      this.#disposers.push(provider.start());
    }
  }

  [Symbol.dispose](): void {
    for (const dispose of this.#disposers) dispose();
    this.#disposers.length = 0;
  }
}
