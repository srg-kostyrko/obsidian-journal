import { createNanoEvents } from "nanoevents";

import { inject, InjectorToken } from "@/infrastructure/di";
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
  // only the owning provider knows — the index just delegates once the text exists. Resolved
  // through the injector rather than injected as a field: a provider (CheckboxTaskProvider) needs
  // the host, which needs this index, so eagerly injecting TaskProviderToken here at construction
  // closes a cycle. Deferring the lookup to hydrate() — already documented as "lazy on request" —
  // resolves it after every constructor in the chain has already returned.
  readonly #injector = inject(InjectorToken);
  readonly events: Subscribable<TaskIndexEvents> = this.#emitter;

  #set(path: VaultPath, providerId: string, items: readonly TaskItem[]): void {
    const byProvider = this.#byPath.get(path) ?? new Map<string, readonly TaskItem[]>();
    if (items.length === 0) byProvider.delete(providerId);
    else byProvider.set(providerId, items);
    if (byProvider.size === 0) this.#byPath.delete(path);
    else this.#byPath.set(path, byProvider);
  }

  #itemsAt(path: VaultPath, providerId: string): readonly TaskItem[] {
    return this.#byPath.get(path)?.get(providerId) ?? [];
  }

  #pathsOf(providerId: string): VaultPath[] {
    return [...this.#byPath].filter(([, byProvider]) => byProvider.has(providerId)).map(([path]) => path);
  }

  async #readInto(path: VaultPath): Promise<void> {
    const note = this.#notes.find(path);
    if (note.isNone()) {
      // A path cached from an earlier hydrate that has since been deleted must not keep
      // serving that stale text — evict rather than leave the last-known lines in place.
      this.#text.delete(path);
      return;
    }
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

  // A publish that restates what is already stored must not bump the version. Every consumer
  // reseeds off it — use-cell-decorations reads it inside a watchEffect, so one bump re-runs
  // rebuildScopeMaps and evaluateRange over every period on every mounted surface — while the
  // checkbox provider republishes a path on every metadata-changed for a note it owns, including
  // notes holding no checkboxes at all. The same guard absorbs the duplicate publish a newly
  // registered note draws, where entryChanged and metadata-changed both arrive.
  publish(providerId: string, scope: "all" | { path: VaultPath }, items: readonly TaskItem[]): void {
    if (scope === "all") {
      const next = new Map<VaultPath, readonly TaskItem[]>();
      for (const [path, group] of groupByPath(items)) next.set(path, dedupe(group));
      const held = this.#pathsOf(providerId);
      const unchanged =
        held.length === next.size &&
        held.every((path) => sameItems(this.#itemsAt(path, providerId), next.get(path) ?? []));
      if (unchanged) return;
      for (const path of held) this.#set(path, providerId, []);
      for (const [path, group] of next) this.#set(path, providerId, group);
    } else {
      const deduped = dedupe(items);
      if (sameItems(this.#itemsAt(scope.path, providerId), deduped)) return;
      this.#set(scope.path, providerId, deduped);
    }
    this.#version++;
    this.#emitter.emit("changed");
  }

  async hydrate(items: readonly TaskItem[]): Promise<readonly TaskItem[]> {
    const paths = new Set(
      items.filter((item) => item.display.kind === "line" && item.display.markdown === null).map((item) => item.path),
    );
    for (const path of paths) await this.#readInto(path);
    const providers = new Map(this.#injector.resolve(TaskProviderToken).map((provider) => [provider.id, provider]));
    return items.map((item) => {
      if (item.display.kind !== "line" || item.display.markdown !== null) return item;
      const cached = this.#text.get(item.path);
      // An item whose line has since fallen past end-of-file slices to "", which is not null and
      // would be stored as hydrated-but-blank. Leave the markdown null instead: the next publish
      // carries its real position, and blank markdown is indistinguishable from a real empty line.
      const markdown = cached?.lines.slice(item.display.line, item.display.endLine + 1).join("\n");
      if (!markdown) return item;
      const provider = providers.get(item.provider);
      if (provider?.hydrateItem) return provider.hydrateItem(item, markdown);
      return { ...item, display: { ...item.display, markdown } };
    });
  }
}

function dedupe(items: readonly TaskItem[]): readonly TaskItem[] {
  return [...new Map(items.map((item) => [item.key, item])).values()];
}

// A whole-array serialization rather than a field-by-field comparison, and deliberately so: this
// one fails *safe*. A field a later provider adds, or a key order that differs, makes two equal
// sets compare unequal — one redundant reseed, which is exactly the behavior this guard replaces.
// A hand-listed field check fails the other way, silently swallowing a change in a field it does
// not name; a status flipping on an unmoved line is the case that would cost a decoration. It is
// cheap against what it saves: the comparison is over one path's items (or, for "all", one path at
// a time), while the reseed it skips is evaluateRange over every period on every mounted surface.
// Nothing on a published item is undefined, so JSON dropping undefined cannot collapse two
// different sets onto one string.
function sameItems(a: readonly TaskItem[], b: readonly TaskItem[]): boolean {
  return a.length === b.length && JSON.stringify(a) === JSON.stringify(b);
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
