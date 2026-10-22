import { createNanoEvents } from "nanoevents";

import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import type { Subscribable, TypedEmitter } from "@/infrastructure/events";
import { NotesService, type VaultPath } from "@/infrastructure/host";

import type { TaskDateRole, TaskItem } from "./types";

export interface TaskIndexEvents {
  changed: () => void;
}

export class TaskIndex {
  readonly #byPath = new Map<VaultPath, Map<string, readonly TaskItem[]>>();
  readonly #emitter: TypedEmitter<TaskIndexEvents> = createNanoEvents();
  #version = 0;
  // Per-role dated items grouped by date, built on the first datedIn that asks for the role: the
  // decoration engine asks once per grid cell, so a scan of every item would be per cell. A one-path
  // publish patches them in place and only an "all" publish drops them, because every edit is a
  // publish, and rebuilding is a pass over every item in the vault (~90k dated in the #349 spike's
  // shape, where a full re-sort cost ~75 ms per role per edit). Only the distinct dates are kept in
  // order; the query sorts its own slice.
  readonly #byRole = new Map<TaskDateRole, DatedGroups>();
  readonly #notes = inject(NotesService);
  // Text is not in metadataCache, so a "line" item's markdown is hydrated lazily on request and
  // cached per path, keyed by mtime — a modified note invalidates precisely, a re-read is free.
  readonly #text = new Map<VaultPath, { readonly mtime: number; readonly lines: readonly string[] }>();
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

  #groupsFor(role: TaskDateRole): DatedGroups {
    const cached = this.#byRole.get(role);
    if (cached) return cached;
    const byDate = new Map<AnchorString, TaskItem[]>();
    for (const byProvider of this.#byPath.values()) {
      for (const items of byProvider.values()) {
        for (const item of items) {
          const date = datedAs(item, role);
          if (date === undefined) continue;
          const bucket = byDate.get(date);
          if (bucket) bucket.push(item);
          else byDate.set(date, [item]);
        }
      }
    }
    const groups = { dates: [...byDate.keys()].toSorted(), byDate };
    this.#byRole.set(role, groups);
    return groups;
  }

  #patchGroups(removed: readonly TaskItem[], added: readonly TaskItem[]): void {
    // Removed by identity: the groups hold the very objects #byPath stored.
    const gone = new Set(removed);
    for (const [role, { dates, byDate }] of this.#byRole) {
      for (const item of removed) {
        const date = datedAs(item, role);
        const bucket = date === undefined ? undefined : byDate.get(date);
        if (date === undefined || bucket === undefined) continue;
        const kept = bucket.filter((held) => !gone.has(held));
        if (kept.length > 0) byDate.set(date, kept);
        else {
          byDate.delete(date);
          const at = firstIndexWhere(dates, (held) => held >= date);
          if (dates[at] === date) dates.splice(at, 1);
        }
      }
      for (const item of added) {
        const date = datedAs(item, role);
        if (date === undefined) continue;
        const bucket = byDate.get(date);
        if (bucket) bucket.push(item);
        else {
          byDate.set(date, [item]);
          dates.splice(
            firstIndexWhere(dates, (held) => held >= date),
            0,
            date,
          );
        }
      }
    }
  }

  version(): number {
    return this.#version;
  }

  itemsIn(path: VaultPath): readonly TaskItem[] {
    const byProvider = this.#byPath.get(path);
    if (!byProvider) return [];
    return [...byProvider.values()].flat();
  }

  datedIn(roles: readonly TaskDateRole[], start: AnchorString, end: AnchorString): readonly TaskItem[] {
    const matched = new Map<string, DatedEntry>();
    const distinctRoles = new Set(roles);
    for (const role of distinctRoles) {
      const { dates, byDate } = this.#groupsFor(role);
      const inRange = datesBetween(dates, start, end).flatMap((date) =>
        (byDate.get(date) ?? []).map((item) => ({ date, item })),
      );
      for (const entry of inRange) {
        const known = matched.get(entry.item.key);
        if (!known || compareEntries(entry, known) < 0) matched.set(entry.item.key, entry);
      }
    }
    return [...matched.values()].toSorted(compareEntries).map((entry) => entry.item);
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
      this.#byRole.clear();
    } else {
      const deduped = dedupe(items);
      const previous = this.#itemsAt(scope.path, providerId);
      if (sameItems(previous, deduped)) return;
      this.#set(scope.path, providerId, deduped);
      this.#patchGroups(previous, deduped);
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
      // An item whose line has since fallen past end-of-file slices to "", which is not null and
      // would be stored as hydrated-but-blank. Leave the markdown null instead: the next publish
      // carries its real position, and blank markdown is indistinguishable from a real empty line.
      const markdown = cached?.lines.slice(item.display.line, item.display.endLine + 1).join("\n");
      if (!markdown) return item;
      return { ...item, display: { ...item.display, markdown } };
    });
  }
}

interface DatedGroups {
  readonly dates: AnchorString[];
  readonly byDate: Map<AnchorString, TaskItem[]>;
}

function datedAs(item: TaskItem, role: TaskDateRole): AnchorString | undefined {
  return item.relations.includes("date") ? item.dates[role] : undefined;
}

interface DatedEntry {
  readonly date: AnchorString;
  readonly item: TaskItem;
}

function compareEntries(a: DatedEntry, b: DatedEntry): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.item.key === b.item.key) return 0;
  return a.item.key < b.item.key ? -1 : 1;
}

// Dates are sorted, so the inclusive range is one contiguous slice found by two bisections.
function datesBetween(dates: readonly AnchorString[], start: AnchorString, end: AnchorString): AnchorString[] {
  return dates.slice(
    firstIndexWhere(dates, (date) => date >= start),
    firstIndexWhere(dates, (date) => date > end),
  );
}

function firstIndexWhere(dates: readonly AnchorString[], test: (date: AnchorString) => boolean): number {
  let lo = 0;
  let hi = dates.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const date = dates[mid];
    if (date !== undefined && test(date)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
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
