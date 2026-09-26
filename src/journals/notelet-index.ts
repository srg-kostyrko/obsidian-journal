import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";
import { InvariantError } from "@/infrastructure/result";

import type { NoteletEntry } from "./types";

const EMPTY: readonly VaultPath[] = [];
const EMPTY_ANCHORS: readonly AnchorString[] = [];

interface Placement {
  readonly anchor: AnchorString;
  readonly typeName: string;
}

export class NoteletIndex {
  readonly #byAnchor = new Map<AnchorString, VaultPath[]>();
  readonly #byType = new Map<string, VaultPath[]>();
  readonly #placements = new Map<VaultPath, Placement>();
  // Mirrors JournalIndex's own sorted array: one entry per anchor currently holding at least one
  // notelet, kept in step with #byAnchor's key set at every mutation rather than rebuilt from it —
  // so a range query is a binary search instead of a scan of every notelet the journal has.
  readonly #sortedAnchors: AnchorString[] = [];

  #bsearch(target: AnchorString): { found: true; index: number } | { found: false; insertionPoint: number } {
    let lo = 0;
    let hi = this.#sortedAnchors.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const current = this.#sortedAnchors[mid];
      if (current === target) return { found: true, index: mid };
      if (current < target) lo = mid + 1;
      else hi = mid;
    }
    return { found: false, insertionPoint: lo };
  }

  #insertSorted(anchor: AnchorString): void {
    const result = this.#bsearch(anchor);
    if (result.found) throw new InvariantError("anchor already present in sorted array");
    this.#sortedAnchors.splice(result.insertionPoint, 0, anchor);
  }

  #removeSorted(anchor: AnchorString): void {
    const result = this.#bsearch(anchor);
    if (!result.found) return;
    this.#sortedAnchors.splice(result.index, 1);
  }

  #push<K>(map: Map<K, VaultPath[]>, key: K, path: VaultPath): void {
    const bucket = map.get(key);
    if (bucket === undefined) {
      map.set(key, [path]);
      return;
    }
    if (bucket.includes(path)) return;
    bucket.push(path);
  }

  #drop<K>(map: Map<K, VaultPath[]>, key: K, path: VaultPath): void {
    const bucket = map.get(key);
    if (bucket === undefined) return;
    const at = bucket.indexOf(path);
    if (at === -1) return;
    bucket.splice(at, 1);
    // Otherwise a churning vault retains one empty array per anchor it has ever touched.
    if (bucket.length === 0) map.delete(key);
  }

  // #byAnchor's key set is the sorted array's source of truth: an anchor enters the array exactly
  // when it enters that map (its bucket goes from absent to one path) and leaves exactly when the
  // bucket empties back out, whichever of add/remove/transferPath drove it.
  #pushAnchor(anchor: AnchorString, path: VaultPath): void {
    const isNewAnchor = !this.#byAnchor.has(anchor);
    this.#push(this.#byAnchor, anchor, path);
    if (isNewAnchor) this.#insertSorted(anchor);
  }

  #dropAnchor(anchor: AnchorString, path: VaultPath): void {
    this.#drop(this.#byAnchor, anchor, path);
    if (!this.#byAnchor.has(anchor)) this.#removeSorted(anchor);
  }

  add(entry: NoteletEntry): void {
    const prior = this.#placements.get(entry.path);
    if (prior !== undefined) {
      this.#dropAnchor(prior.anchor, entry.path);
      this.#drop(this.#byType, prior.typeName, entry.path);
    }
    this.#pushAnchor(entry.anchor, entry.path);
    this.#push(this.#byType, entry.typeName, entry.path);
    this.#placements.set(entry.path, { anchor: entry.anchor, typeName: entry.typeName });
  }

  remove(entry: NoteletEntry): void {
    const placement = this.#placements.get(entry.path);
    if (placement === undefined) return;
    this.#dropAnchor(placement.anchor, entry.path);
    this.#drop(this.#byType, placement.typeName, entry.path);
    this.#placements.delete(entry.path);
  }

  transferPath(entry: NoteletEntry, to: VaultPath): void {
    this.remove(entry);
    this.add({ ...entry, path: to });
  }

  atAnchor(anchor: AnchorString): readonly VaultPath[] {
    return this.#byAnchor.get(anchor) ?? EMPTY;
  }

  ofType(typeName: string): readonly VaultPath[] {
    return this.#byType.get(typeName) ?? EMPTY;
  }

  paths(): readonly VaultPath[] {
    return [...this.#placements.keys()];
  }

  // Inclusive of both ends, same as JournalIndex.getRange: a rollup widens its lower bound to the
  // anchor of the period holding `from` and its upper bound to the target's own period end, so a
  // notelet sitting exactly on either boundary has to come back, not just one strictly inside it.
  anchorsInRange(start: AnchorString, end: AnchorString): readonly AnchorString[] {
    if (start > end) return EMPTY_ANCHORS;
    const startResult = this.#bsearch(start);
    const startIndex = startResult.found ? startResult.index : startResult.insertionPoint;
    const out: AnchorString[] = [];
    for (let i = startIndex; i < this.#sortedAnchors.length; i++) {
      const anchor = this.#sortedAnchors[i];
      if (anchor > end) break;
      out.push(anchor);
    }
    return out;
  }

  clear(): void {
    this.#byAnchor.clear();
    this.#byType.clear();
    this.#placements.clear();
    this.#sortedAnchors.length = 0;
  }
}
