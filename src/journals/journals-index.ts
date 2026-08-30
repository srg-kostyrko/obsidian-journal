import { createNanoEvents } from "nanoevents";

import type { AnchorString } from "@/calendar";
import type { Subscribable, TypedEmitter } from "@/infrastructure/events";
import type { VaultPath } from "@/infrastructure/host";
import { Option } from "@/infrastructure/result";

import { JournalIndex } from "./journal-index";
import { NoteletIndex } from "./notelet-index";
import { isNotelet, periodEntryOf } from "./types";

import type { IndexedNote, JournalEntry, JournalsIndexEvents, NoteletEntry } from "./types";

function sameAnswers(a: IndexedNote, b: IndexedNote): boolean {
  const aAnswers = a.answers ?? {};
  const bAnswers = b.answers ?? {};
  const keys = Object.keys(aAnswers);
  if (keys.length !== Object.keys(bAnswers).length) return false;
  return keys.every((key) => aAnswers[key] === bAnswers[key]);
}

// Everything an entry carries beyond the (journalName, anchor) slot it occupies. A custom cycle
// steps from the stored endDate, so a stale payload silently freezes the sequence for the session.
function samePayload(a: IndexedNote, b: IndexedNote): boolean {
  if (isNotelet(a) || isNotelet(b)) {
    if (!isNotelet(a) || !isNotelet(b)) return false;
    return a.typeName === b.typeName && a.typeId === b.typeId && a.counter === b.counter && sameAnswers(a, b);
  }
  if (a.endDate !== b.endDate) return false;
  const aNumbers = a.numbers ?? {};
  const bNumbers = b.numbers ?? {};
  const numberKeys = Object.keys(aNumbers);
  if (numberKeys.length !== Object.keys(bNumbers).length) return false;
  if (numberKeys.some((key) => aNumbers[key] !== bNumbers[key])) return false;
  return sameAnswers(a, b);
}

// A notelet's slot includes its type name because `NoteletIndex.#byType` is keyed by it, so a
// retype has to leave the old bucket.
function sameSlot(a: IndexedNote, b: IndexedNote): boolean {
  if (a.journalName !== b.journalName || a.anchor !== b.anchor) return false;
  if (isNotelet(a) !== isNotelet(b)) return false;
  return !isNotelet(a) || !isNotelet(b) || a.typeName === b.typeName;
}

export class JournalsIndex {
  readonly #journals = new Map<string, JournalIndex>();
  readonly #notelets = new Map<string, NoteletIndex>();
  readonly #byPath = new Map<VaultPath, IndexedNote>();
  readonly #emitter: TypedEmitter<JournalsIndexEvents> = createNanoEvents();
  readonly #dirty = new Set<string>();
  #flushScheduled = false;
  #resolveReady: (() => void) | undefined;
  #readyFlag = false;
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

  #resolveNotelets(paths: readonly VaultPath[] | undefined): readonly NoteletEntry[] {
    if (paths === undefined) return [];
    const out: NoteletEntry[] = [];
    for (const path of paths) {
      const entry = this.#byPath.get(path);
      if (entry !== undefined && isNotelet(entry)) out.push(entry);
    }
    return out;
  }

  #noteletIndexFor(journalName: string): NoteletIndex {
    let noteletIndex = this.#notelets.get(journalName);
    if (!noteletIndex) {
      noteletIndex = new NoteletIndex();
      this.#notelets.set(journalName, noteletIndex);
    }
    return noteletIndex;
  }

  // `owner` is the path whose claim on the slot is being checked: a collision loser never owned
  // the anchor slot, so releasing it must not delete the incumbent's.
  #releaseSlot(existing: IndexedNote, owner: VaultPath): void {
    if (isNotelet(existing)) {
      this.#notelets.get(existing.journalName)?.remove(existing);
      return;
    }
    const journalIndex = this.#journals.get(existing.journalName);
    const slot = journalIndex?.get(existing.anchor);
    if (slot !== undefined && slot.isSome() && slot.value === owner) journalIndex?.delete(existing.anchor);
  }

  whenReady(): Promise<void> {
    return this.#ready;
  }

  isReady(): boolean {
    return this.#readyFlag;
  }

  markReady(): void {
    this.#readyFlag = true;
    this.#resolveReady?.();
  }

  entryByPath(path: VaultPath): Option<IndexedNote> {
    return Option.fromNullable(this.#byPath.get(path));
  }

  entryByAnchor(journalName: string, anchor: AnchorString): Option<JournalEntry> {
    const journalIndex = this.#journals.get(journalName);
    if (!journalIndex) return Option.none();
    return journalIndex
      .get(anchor)
      .flatMap((path) => Option.fromNullable(this.#byPath.get(path)))
      .flatMap(periodEntryOf);
  }

  noteletsAt(journalName: string, anchor: AnchorString): readonly NoteletEntry[] {
    return this.#resolveNotelets(this.#notelets.get(journalName)?.atAnchor(anchor));
  }

  noteletsOfType(journalName: string, typeName: string): readonly NoteletEntry[] {
    return this.#resolveNotelets(this.#notelets.get(journalName)?.ofType(typeName));
  }

  register(entry: IndexedNote): "registered" | "collision" {
    const existing = this.#byPath.get(entry.path);
    if (existing !== undefined && sameSlot(existing, entry)) {
      // The note has not moved, so the slot and the collision verdict below are settled — but
      // the payload can still have changed and must not be skipped along with them.
      if (samePayload(existing, entry)) return "registered";
      this.#byPath.set(entry.path, entry);
      this.#emitter.emit("entryChanged", { entry, kind: "added" });
      this.#markDirty(entry.journalName);
      return "registered";
    }
    if (existing !== undefined) {
      this.#releaseSlot(existing, entry.path);
      this.#emitter.emit("entryChanged", { entry: existing, kind: "removed" });
      this.#markDirty(existing.journalName);
    }
    if (isNotelet(entry)) {
      this.#noteletIndexFor(entry.journalName).add(entry);
      this.#byPath.set(entry.path, entry);
      this.#emitter.emit("entryChanged", { entry, kind: "added" });
      this.#markDirty(entry.journalName);
      return "registered";
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
    this.#releaseSlot(existing, path);
    this.#byPath.delete(path);
    this.#emitter.emit("entryChanged", { entry: existing, kind: "removed" });
    this.#markDirty(existing.journalName);
  }

  transferPath(from: VaultPath, to: VaultPath): void {
    if (from === to) return;
    const existing = this.#byPath.get(from);
    if (!existing) return;
    const next: IndexedNote = { ...existing, path: to };
    if (isNotelet(existing)) {
      this.#notelets.get(existing.journalName)?.transferPath(existing, to);
    } else {
      const journalIndex = this.#journals.get(existing.journalName);
      const slot = journalIndex?.get(existing.anchor);
      if (slot !== undefined && slot.isSome() && slot.value === from) journalIndex?.set(existing.anchor, to);
    }
    this.#byPath.delete(from);
    this.#byPath.set(to, next);
    this.#emitter.emit("entryChanged", { entry: existing, kind: "removed" });
    this.#emitter.emit("entryChanged", { entry: next, kind: "added" });
    this.#markDirty(existing.journalName);
  }

  clearJournal(journalName: string): void {
    const journalIndex = this.#journals.get(journalName);
    const noteletIndex = this.#notelets.get(journalName);
    if (!journalIndex && !noteletIndex) return;
    for (const [path, entry] of this.#byPath) {
      if (entry.journalName === journalName) this.#byPath.delete(path);
    }
    journalIndex?.clear();
    this.#journals.delete(journalName);
    noteletIndex?.clear();
    this.#notelets.delete(journalName);
    this.#markDirty(journalName);
  }

  clear(): void {
    const names = new Set([...this.#journals.keys(), ...this.#notelets.keys()]);
    this.#byPath.clear();
    for (const journalIndex of this.#journals.values()) journalIndex.clear();
    this.#journals.clear();
    for (const noteletIndex of this.#notelets.values()) noteletIndex.clear();
    this.#notelets.clear();
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
      const anchor = path
        .flatMap((found) => this.entryByPath(found))
        .flatMap(periodEntryOf)
        .map((found) => found.anchor);
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
