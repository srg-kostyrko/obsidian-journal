import { createNanoEvents } from "nanoevents";

import type { AnchorString } from "@/calendar";
import type { Subscribable, TypedEmitter } from "@/infrastructure/events";
import type { VaultPath } from "@/infrastructure/host";
import { Option } from "@/infrastructure/result";

import { JournalIndex } from "./journal-index";

import type { JournalEntry, JournalsIndexEvents } from "./types";

export class JournalsIndex {
  readonly #journals = new Map<string, JournalIndex>();
  readonly #byPath = new Map<VaultPath, JournalEntry>();
  readonly #emitter: TypedEmitter<JournalsIndexEvents> = createNanoEvents();
  readonly events: Subscribable<JournalsIndexEvents> = this.#emitter;

  readonly #dirty = new Set<string>();
  #flushScheduled = false;

  entryByPath(path: VaultPath): Option<JournalEntry> {
    return Option.fromNullable(this.#byPath.get(path));
  }

  entryByAnchor(journalName: string, anchor: AnchorString): Option<JournalEntry> {
    const journalIndex = this.#journals.get(journalName);
    if (!journalIndex) return Option.none();
    return journalIndex.get(anchor).flatMap((path) => Option.fromNullable(this.#byPath.get(path)));
  }

  register(entry: JournalEntry): void {
    const existing = this.#byPath.get(entry.path);
    if (existing) {
      if (existing.journalName === entry.journalName && existing.anchor === entry.anchor) {
        return;
      }
      this.#journals.get(existing.journalName)?.delete(existing.anchor);
      this.#emitter.emit("entryChanged", { entry: existing, kind: "removed" });
      this.#markDirty(existing.journalName);
    }
    let journalIndex = this.#journals.get(entry.journalName);
    if (!journalIndex) {
      journalIndex = new JournalIndex();
      this.#journals.set(entry.journalName, journalIndex);
    }
    journalIndex.set(entry.anchor, entry.path);
    this.#byPath.set(entry.path, entry);
    this.#emitter.emit("entryChanged", { entry, kind: "added" });
    this.#markDirty(entry.journalName);
  }

  unregister(path: VaultPath): void {
    const existing = this.#byPath.get(path);
    if (!existing) return;
    this.#journals.get(existing.journalName)?.delete(existing.anchor);
    this.#byPath.delete(path);
    this.#emitter.emit("entryChanged", { entry: existing, kind: "removed" });
    this.#markDirty(existing.journalName);
  }

  transferPath(from: VaultPath, to: VaultPath): void {
    if (from === to) return;
    const existing = this.#byPath.get(from);
    if (!existing) return;
    const next: JournalEntry = { ...existing, path: to };
    const journalIndex = this.#journals.get(existing.journalName);
    journalIndex?.set(existing.anchor, to);
    this.#byPath.delete(from);
    this.#byPath.set(to, next);
    this.#emitter.emit("entryChanged", { entry: existing, kind: "removed" });
    this.#emitter.emit("entryChanged", { entry: next, kind: "added" });
    this.#markDirty(existing.journalName);
  }

  clearJournal(journalName: string): void {
    const journalIndex = this.#journals.get(journalName);
    if (!journalIndex) return;
    for (const [, path] of journalIndex) {
      this.#byPath.delete(path);
    }
    journalIndex.clear();
    this.#journals.delete(journalName);
    this.#markDirty(journalName);
  }

  clear(): void {
    const names = [...this.#journals.keys()];
    this.#byPath.clear();
    for (const journalIndex of this.#journals.values()) journalIndex.clear();
    this.#journals.clear();
    for (const name of names) this.#markDirty(name);
  }

  has(journalName: string, anchor: AnchorString): boolean {
    return this.#journals.get(journalName)?.has(anchor) ?? false;
  }

  get(journalName: string, anchor: AnchorString): Option<VaultPath> {
    const journalIndex = this.#journals.get(journalName);
    return journalIndex ? journalIndex.get(anchor) : Option.none();
  }

  getRange(journalName: string, start: AnchorString, end: AnchorString): ReadonlyMap<AnchorString, VaultPath> {
    const journalIndex = this.#journals.get(journalName);
    return journalIndex ? journalIndex.getRange(start, end) : new Map();
  }

  findNext(journalName: string, from: AnchorString): Option<VaultPath> {
    const journalIndex = this.#journals.get(journalName);
    return journalIndex ? journalIndex.findNext(from) : Option.none();
  }

  findPrevious(journalName: string, from: AnchorString): Option<VaultPath> {
    const journalIndex = this.#journals.get(journalName);
    return journalIndex ? journalIndex.findPrevious(from) : Option.none();
  }

  findNearestExisting(
    journalNames: readonly string[],
    from: AnchorString,
    direction: "previous" | "next",
  ): Option<AnchorString> {
    let best: AnchorString | undefined;
    for (const name of journalNames) {
      const path = direction === "previous" ? this.findPrevious(name, from) : this.findNext(name, from);
      const anchor = path.flatMap((found) => this.entryByPath(found)).map((found) => found.anchor);
      if (anchor.isNone()) continue;
      const candidate = anchor.value;
      if (best === undefined || (direction === "previous" ? candidate > best : candidate < best)) {
        best = candidate;
      }
    }
    return Option.fromNullable(best);
  }

  findClosestAnchor(journalName: string, to: AnchorString): Option<AnchorString> {
    const journalIndex = this.#journals.get(journalName);
    return journalIndex ? journalIndex.findClosestAnchor(to) : Option.none();
  }

  *entriesFor(journalName: string): Iterable<readonly [AnchorString, VaultPath]> {
    const journalIndex = this.#journals.get(journalName);
    if (!journalIndex) return;
    yield* journalIndex;
  }

  #markDirty(journalName: string): void {
    this.#dirty.add(journalName);
    if (this.#flushScheduled) return;
    this.#flushScheduled = true;
    queueMicrotask(() => {
      this.#flushScheduled = false;
      const names = [...this.#dirty];
      this.#dirty.clear();
      for (const name of names) {
        this.#emitter.emit("journalDirty", { journalName: name });
      }
    });
  }
}
