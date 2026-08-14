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
  readonly #dirty = new Set<string>();
  #flushScheduled = false;
  #resolveReady: (() => void) | undefined;
  // The boot-time vault walk populates the index behind layout-ready and all-notes-resolved, so
  // until it lands the index is empty rather than authoritative — and "no entry for this anchor"
  // means "not indexed yet", not "no note exists". A consumer that would act on that difference
  // (auto-create duplicates a note living off its derived path) waits here. Not ready until
  // VaultSubscriptionService says so: never acting is safer than acting on an empty index.
  readonly #ready = new Promise<void>((resolve) => {
    this.#resolveReady = resolve;
  });
  readonly events: Subscribable<JournalsIndexEvents> = this.#emitter;

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

  whenReady(): Promise<void> {
    return this.#ready;
  }

  markReady(): void {
    this.#resolveReady?.();
  }

  entryByPath(path: VaultPath): Option<JournalEntry> {
    return Option.fromNullable(this.#byPath.get(path));
  }

  entryByAnchor(journalName: string, anchor: AnchorString): Option<JournalEntry> {
    const journalIndex = this.#journals.get(journalName);
    if (!journalIndex) return Option.none();
    return journalIndex.get(anchor).flatMap((path) => Option.fromNullable(this.#byPath.get(path)));
  }

  register(entry: JournalEntry): "registered" | "collision" {
    const existing = this.#byPath.get(entry.path);
    if (existing?.journalName === entry.journalName && existing?.anchor === entry.anchor) {
      return "registered";
    }
    if (existing) {
      // Only free the old slot if this path actually owned it — a collision loser being re-anchored
      // must not delete the incumbent's slot.
      const oldIndex = this.#journals.get(existing.journalName);
      const oldSlot = oldIndex?.get(existing.anchor);
      if (oldSlot !== undefined && oldSlot.isSome() && oldSlot.value === entry.path) {
        oldIndex?.delete(existing.anchor);
      }
      this.#emitter.emit("entryChanged", { entry: existing, kind: "removed" });
      this.#markDirty(existing.journalName);
    }
    let journalIndex = this.#journals.get(entry.journalName);
    if (!journalIndex) {
      journalIndex = new JournalIndex();
      this.#journals.set(entry.journalName, journalIndex);
    }
    // A different note already owns this (journal, anchor) slot — e.g. a sync conflict copy that
    // shares the original's frontmatter, or a settings-preview entry mirroring today's real note.
    // Keep the incumbent as the canonical anchor owner (calendar/navigation resolve to it), but
    // still track the newcomer by path so entryByPath resolves it. Never overwrite the slot or
    // orphan the incumbent.
    const occupant = journalIndex.get(entry.anchor);
    const collision = occupant.isSome() && occupant.value !== entry.path;
    if (!collision) journalIndex.set(entry.anchor, entry.path);
    this.#byPath.set(entry.path, entry);
    this.#emitter.emit("entryChanged", { entry, kind: "added" });
    this.#markDirty(entry.journalName);
    return collision ? "collision" : "registered";
  }

  unregister(path: VaultPath): void {
    const existing = this.#byPath.get(path);
    if (!existing) return;
    const journalIndex = this.#journals.get(existing.journalName);
    // Only free the anchor slot if it still points at this path: a collision newcomer never owned
    // the slot (so this leaves the incumbent's slot intact), and we must never delete a slot
    // another note owns.
    const slot = journalIndex?.get(existing.anchor);
    if (slot !== undefined && slot.isSome() && slot.value === path) journalIndex?.delete(existing.anchor);
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
    // Only move the anchor slot if `from` actually owned it — a collision loser being renamed
    // must not seize the incumbent's slot.
    const slot = journalIndex?.get(existing.anchor);
    if (slot !== undefined && slot.isSome() && slot.value === from) journalIndex?.set(existing.anchor, to);
    this.#byPath.delete(from);
    this.#byPath.set(to, next);
    this.#emitter.emit("entryChanged", { entry: existing, kind: "removed" });
    this.#emitter.emit("entryChanged", { entry: next, kind: "added" });
    this.#markDirty(existing.journalName);
  }

  clearJournal(journalName: string): void {
    const journalIndex = this.#journals.get(journalName);
    if (!journalIndex) return;
    for (const [path, entry] of this.#byPath) {
      if (entry.journalName === journalName) this.#byPath.delete(path);
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

  pathsAt(journalNames: readonly string[], anchor: AnchorString): readonly VaultPath[] {
    const paths: VaultPath[] = [];
    for (const name of journalNames) {
      const found = this.entryByAnchor(name, anchor);
      if (found.isSome()) paths.push(found.value.path);
    }
    return paths;
  }

  *entriesFor(journalName: string): Iterable<readonly [AnchorString, VaultPath]> {
    const journalIndex = this.#journals.get(journalName);
    if (!journalIndex) return;
    yield* journalIndex;
  }
}
