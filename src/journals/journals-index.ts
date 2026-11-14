import { createNanoEvents } from "nanoevents";

import type { AnchorString } from "@/calendar";
import type { Subscribable, TypedEmitter } from "@/infrastructure/events";
import type { VaultPath } from "@/infrastructure/host";
import { Option } from "@/infrastructure/result";

import { JournalIndex } from "./journal-index";
import { NoteletIndex } from "./notelet-index";
import { isNotelet, periodEntryOf } from "./types";

import type {
  EntryAddedReason,
  EntryOrigin,
  EntryRemovedReason,
  IndexedNote,
  JournalEntry,
  JournalsIndexEvents,
  NoteletEntry,
} from "./types";

const REASON_BY_ORIGIN: Readonly<Record<EntryOrigin, EntryAddedReason>> = {
  walk: "indexed",
  live: "appeared",
  created: "created",
  preview: "preview",
};

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
  readonly #previews = new Set<VaultPath>();
  // Notes that lost their (journal, anchor) slot to another note, so one can take it over when the
  // owner leaves — otherwise deleting the original of a sync-conflict pair leaves the copy unreachable
  // by date until the next rescan.
  readonly #losers = new Map<string, Map<AnchorString, Set<VaultPath>>>();
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

  #losersAt(journalName: string, anchor: AnchorString): Set<VaultPath> {
    let byAnchor = this.#losers.get(journalName);
    if (!byAnchor) {
      byAnchor = new Map();
      this.#losers.set(journalName, byAnchor);
    }
    let paths = byAnchor.get(anchor);
    if (!paths) {
      paths = new Set();
      byAnchor.set(anchor, paths);
    }
    return paths;
  }

  #dropLoser(journalName: string, anchor: AnchorString, path: VaultPath): void {
    const byAnchor = this.#losers.get(journalName);
    const paths = byAnchor?.get(anchor);
    if (!byAnchor || !paths?.delete(path)) return;
    if (paths.size === 0) byAnchor.delete(anchor);
    if (byAnchor.size === 0) this.#losers.delete(journalName);
  }

  // `owner` is the path whose claim on the slot is being checked: a collision loser never owned
  // the anchor slot, so releasing it must not delete the incumbent's — the notelet arm ignores
  // `owner` because a notelet anchor has no single owner to protect. Returns the loser promoted
  // into a freed slot, which the caller announces after its own removal. Path order, not arrival
  // order, picks it, so every device promotes the same copy.
  #releaseSlot(existing: IndexedNote, owner: VaultPath): IndexedNote | undefined {
    if (isNotelet(existing)) {
      this.#notelets.get(existing.journalName)?.remove(existing);
      return undefined;
    }
    const journalIndex = this.#journals.get(existing.journalName);
    const slot = journalIndex?.get(existing.anchor);
    if (journalIndex === undefined || slot === undefined || !slot.isSome() || slot.value !== owner) {
      this.#dropLoser(existing.journalName, existing.anchor, owner);
      return undefined;
    }
    journalIndex.delete(existing.anchor);
    const candidates = this.#losers.get(existing.journalName)?.get(existing.anchor);
    if (candidates === undefined) return undefined;
    const next = [...candidates].toSorted().at(0);
    if (next === undefined) return undefined;
    this.#dropLoser(existing.journalName, existing.anchor, next);
    const promoted = this.#byPath.get(next);
    if (promoted === undefined) return undefined;
    journalIndex.set(existing.anchor, next);
    return promoted;
  }

  // A notelet has no slot to lose; a period note is canonical while it owns its (journal, anchor) slot.
  #isCanonical(entry: IndexedNote): boolean {
    if (isNotelet(entry)) return true;
    const slot = this.#journals.get(entry.journalName)?.get(entry.anchor);
    return slot !== undefined && slot.isSome() && slot.value === entry.path;
  }

  #emitAdded(entry: IndexedNote, reason: EntryAddedReason, previous?: IndexedNote): void {
    this.#emitter.emit("entryChanged", {
      entry,
      kind: "added",
      reason,
      canonical: this.#isCanonical(entry),
      ...(previous !== undefined && { previous }),
    });
  }

  #emitRemoved(entry: IndexedNote, reason: EntryRemovedReason): void {
    this.#emitter.emit("entryChanged", { entry, kind: "removed", reason });
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

  noteletsFor(journalName: string): readonly NoteletEntry[] {
    return this.#resolveNotelets(this.#notelets.get(journalName)?.paths());
  }

  noteletAnchorsInRange(journalName: string, start: AnchorString, end: AnchorString): readonly AnchorString[] {
    return this.#notelets.get(journalName)?.anchorsInRange(start, end) ?? [];
  }

  // Strictly before `from`, like findPrevious: a notelet needs no period note at its anchor.
  previousNoteletAnchor(journalName: string, from: AnchorString): Option<AnchorString> {
    return Option.fromNullable(this.#notelets.get(journalName)?.previousAnchor(from));
  }

  register(entry: IndexedNote, origin: EntryOrigin = "live"): "registered" | "collision" {
    if (origin === "preview") this.#previews.add(entry.path);
    const existing = this.#byPath.get(entry.path);
    if (existing !== undefined && sameSlot(existing, entry)) {
      // The note has not moved, so the slot and the collision verdict below are settled — but
      // the payload can still have changed and must not be skipped along with them.
      if (samePayload(existing, entry)) return "registered";
      this.#byPath.set(entry.path, entry);
      this.#emitAdded(entry, origin === "preview" ? "preview" : "changed", existing);
      this.#markDirty(entry.journalName);
      return "registered";
    }
    // An entry already at this path in another slot is the same note re-dated, whatever the origin.
    const reason = existing === undefined ? REASON_BY_ORIGIN[origin] : "changed";
    if (existing !== undefined) {
      const promoted = this.#releaseSlot(existing, entry.path);
      this.#emitRemoved(existing, "changed");
      if (promoted) this.#emitAdded(promoted, "changed");
      this.#markDirty(existing.journalName);
    }
    if (isNotelet(entry)) {
      this.#noteletIndexFor(entry.journalName).add(entry);
      this.#byPath.set(entry.path, entry);
      this.#emitAdded(entry, reason);
      this.#markDirty(entry.journalName);
      return "registered";
    }
    let journalIndex = this.#journals.get(entry.journalName);
    if (!journalIndex) {
      journalIndex = new JournalIndex();
      this.#journals.set(entry.journalName, journalIndex);
    }
    // A preview stands in for a note that may not exist, so it is reachable by path only: holding
    // the slot would answer date lookups with a file that is not there and demote the real note
    // when it arrives.
    if (this.#previews.has(entry.path)) {
      this.#byPath.set(entry.path, entry);
      this.#emitAdded(entry, reason);
      this.#markDirty(entry.journalName);
      return "registered";
    }
    // A different note already owns this (journal, anchor) slot — e.g. a sync conflict copy that
    // shares the original's frontmatter. Keep the incumbent as the canonical anchor owner
    // (calendar/navigation resolve to it), but still track the newcomer by path so entryByPath
    // resolves it, and as a loser so it takes the slot over when the incumbent leaves.
    const occupant = journalIndex.get(entry.anchor);
    const collision = occupant.isSome() && occupant.value !== entry.path;
    if (collision) this.#losersAt(entry.journalName, entry.anchor).add(entry.path);
    else journalIndex.set(entry.anchor, entry.path);
    this.#byPath.set(entry.path, entry);
    this.#emitAdded(entry, reason);
    this.#markDirty(entry.journalName);
    return collision ? "collision" : "registered";
  }

  /** Removes every note claiming `anchor` in `journalName` and promotes none: the date itself is invalid. */
  rejectAnchor(journalName: string, anchor: AnchorString): void {
    // Losers first: once none is left, the owner's removal has no copy to promote. Deleting the
    // element being visited is safe while iterating a Set.
    const losers = this.#losers.get(journalName)?.get(anchor) ?? [];
    for (const path of losers) this.unregister(path);
    const slot = this.#journals.get(journalName)?.get(anchor);
    if (slot?.isSome() === true) this.unregister(slot.value);
  }

  unregister(path: VaultPath, reason: "deleted" | "unindexed" = "unindexed"): void {
    const existing = this.#byPath.get(path);
    if (!existing) return;
    const preview = this.#previews.delete(path);
    const promoted = this.#releaseSlot(existing, path);
    this.#byPath.delete(path);
    this.#emitRemoved(existing, preview ? "preview" : reason);
    if (promoted) this.#emitAdded(promoted, "changed");
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
      // Only move the anchor slot if `from` actually owned it — a collision loser being renamed
      // must not seize the incumbent's slot.
      if (slot !== undefined && slot.isSome() && slot.value === from) {
        journalIndex?.set(existing.anchor, to);
      } else if (this.#losers.get(existing.journalName)?.get(existing.anchor)?.has(from) === true) {
        this.#dropLoser(existing.journalName, existing.anchor, from);
        this.#losersAt(existing.journalName, existing.anchor).add(to);
      }
    }
    this.#byPath.delete(from);
    this.#byPath.set(to, next);
    this.#emitRemoved(existing, "moved");
    this.#emitAdded(next, "moved");
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
    this.#losers.delete(journalName);
    noteletIndex?.clear();
    this.#notelets.delete(journalName);
    this.#markDirty(journalName);
  }

  clear(): void {
    const names = new Set([...this.#journals.keys(), ...this.#notelets.keys()]);
    this.#byPath.clear();
    this.#previews.clear();
    this.#losers.clear();
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
