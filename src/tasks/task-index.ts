import { createNanoEvents } from "nanoevents";

import { inject } from "@/infrastructure/di";
import type { Subscribable, TypedEmitter } from "@/infrastructure/events";
import { NotesService, type VaultPath } from "@/infrastructure/host";

import { TaskProviderToken, type TaskItem } from "./types";

export interface TaskIndexEvents {
  changed: () => void;
}

export class TaskIndex {
  readonly #byPath = new Map<VaultPath, Map<string, readonly TaskItem[]>>();
  readonly #emitter: TypedEmitter<TaskIndexEvents> = createNanoEvents();
  #version = 0;
  readonly #notes = inject(NotesService);
  // Text is not in metadataCache, so a "line" item's markdown is hydrated lazily on request and
  // cached per path, keyed by mtime — a modified note invalidates precisely, a re-read is free.
  readonly #text = new Map<VaultPath, { readonly mtime: number; readonly lines: readonly string[] }>();
  // Dates and retargetable ride on the item, but reading them out of a line's text is a dialect
  // only the owning provider knows — the index just delegates once the text exists.
  readonly #providers = inject(TaskProviderToken);
  readonly events: Subscribable<TaskIndexEvents> = this.#emitter;

  #set(path: VaultPath, providerId: string, items: readonly TaskItem[]): void {
    const deduped = [...new Map(items.map((item) => [item.key, item])).values()];
    const byProvider = this.#byPath.get(path) ?? new Map<string, readonly TaskItem[]>();
    if (deduped.length === 0) byProvider.delete(providerId);
    else byProvider.set(providerId, deduped);
    if (byProvider.size === 0) this.#byPath.delete(path);
    else this.#byPath.set(path, byProvider);
  }

  async #readInto(path: VaultPath): Promise<void> {
    const note = this.#notes.find(path);
    if (note.isNone()) return;
    const mtime = note.value.mtime;
    if (this.#text.get(path)?.mtime === mtime) return;
    const read = await this.#notes.readCached(path);
    if (read.kind === "err") return;
    this.#text.set(path, { mtime, lines: read.value.split("\n") });
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

  async hydrate(items: readonly TaskItem[]): Promise<readonly TaskItem[]> {
    const paths = new Set(
      items.filter((item) => item.display.kind === "line" && item.display.markdown === null).map((item) => item.path),
    );
    for (const path of paths) await this.#readInto(path);
    return items.map((item) => {
      if (item.display.kind !== "line" || item.display.markdown !== null) return item;
      const cached = this.#text.get(item.path);
      const markdown = cached?.lines.slice(item.display.line, item.display.endLine + 1).join("\n") ?? null;
      if (markdown === null) return item;
      const provider = this.#providers.find((candidate) => candidate.id === item.provider);
      if (provider?.hydrateItem) return provider.hydrateItem(item, markdown);
      return { ...item, display: { ...item.display, markdown } };
    });
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
