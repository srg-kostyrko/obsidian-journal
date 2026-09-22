import { createNanoEvents, type Emitter } from "nanoevents";

import type { VaultPath } from "@/infrastructure/host";

import type { TaskItem } from "./types";

export interface TaskIndexEvents {
  changed: () => void;
}

export class TaskIndex {
  readonly #byPath = new Map<VaultPath, Map<string, readonly TaskItem[]>>();
  readonly #emitter: Emitter<TaskIndexEvents> = createNanoEvents<TaskIndexEvents>();
  #version = 0;

  #set(path: VaultPath, providerId: string, items: readonly TaskItem[]): void {
    const deduped = [...new Map(items.map((item) => [item.key, item])).values()];
    const byProvider = this.#byPath.get(path) ?? new Map<string, readonly TaskItem[]>();
    if (deduped.length === 0) byProvider.delete(providerId);
    else byProvider.set(providerId, deduped);
    if (byProvider.size === 0) this.#byPath.delete(path);
    else this.#byPath.set(path, byProvider);
  }

  get events(): Emitter<TaskIndexEvents> {
    return this.#emitter;
  }

  version(): number {
    return this.#version;
  }

  itemsIn(path: VaultPath): readonly TaskItem[] {
    const byProvider = this.#byPath.get(path);
    if (!byProvider) return [];
    return [...byProvider.values()].flat();
  }

  publish(providerId: string, scope: "all" | { path: VaultPath }, items: readonly TaskItem[]): void {
    if (scope === "all") {
      for (const [path, byProvider] of this.#byPath) {
        byProvider.delete(providerId);
        if (byProvider.size === 0) this.#byPath.delete(path);
      }
      for (const [path, group] of groupByPath(items)) this.#set(path, providerId, group);
    } else {
      this.#set(scope.path, providerId, items);
    }
    this.#version++;
    this.#emitter.emit("changed");
  }
}

function groupByPath(items: readonly TaskItem[]): Map<VaultPath, TaskItem[]> {
  const grouped = new Map<VaultPath, TaskItem[]>();
  for (const item of items) {
    const bucket = grouped.get(item.path) ?? [];
    bucket.push(item);
    grouped.set(item.path, bucket);
  }
  return grouped;
}
