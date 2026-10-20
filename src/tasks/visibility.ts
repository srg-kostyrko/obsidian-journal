import { inject, InjectorToken } from "@/infrastructure/di";

import { TaskProviderToken, type TaskItem, type TaskProvider } from "./types";

export class TaskVisibility {
  // Resolved through the injector on first use, not injected as a field: providers need the host,
  // which needs the index, so an eager TaskProviderToken injection closes a construction cycle.
  readonly #injector = inject(InjectorToken);
  #providers: ReadonlyMap<string, TaskProvider> | undefined;

  #provider(id: string): TaskProvider | undefined {
    this.#providers ??= new Map(this.#injector.resolve(TaskProviderToken).map((provider) => [provider.id, provider]));
    return this.#providers.get(id);
  }

  // Any-of across the named journals; no journal context cannot narrow.
  admits(item: TaskItem, journalNames: readonly string[]): boolean {
    const provider = this.#provider(item.provider);
    if (provider?.admits === undefined || journalNames.length === 0) return true;
    return journalNames.some((name) => provider.admits?.(item, name) ?? true);
  }
}
