import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";
import { InvariantError, Option } from "@/infrastructure/result";

export class JournalIndex {
  readonly #byAnchor = new Map<AnchorString, VaultPath>();
  readonly #sortedAnchors: AnchorString[] = [];

  has(anchor: AnchorString): boolean {
    return this.#byAnchor.has(anchor);
  }

  get(anchor: AnchorString): Option<VaultPath> {
    return Option.fromNullable(this.#byAnchor.get(anchor));
  }

  set(anchor: AnchorString, path: VaultPath): void {
    if (!this.#byAnchor.has(anchor)) this.#insertSorted(anchor);
    this.#byAnchor.set(anchor, path);
  }

  delete(anchor: AnchorString): void {
    if (!this.#byAnchor.has(anchor)) return;
    this.#removeSorted(anchor);
    this.#byAnchor.delete(anchor);
  }

  clear(): void {
    this.#byAnchor.clear();
    this.#sortedAnchors.length = 0;
  }

  get size(): number {
    return this.#byAnchor.size;
  }

  getRange(start: AnchorString, end: AnchorString): ReadonlyMap<AnchorString, VaultPath> {
    const out = new Map<AnchorString, VaultPath>();
    if (start > end) return out;
    const startResult = this.#bsearch(start);
    const startIndex = startResult.found ? startResult.index : startResult.insertionPoint;
    for (let i = startIndex; i < this.#sortedAnchors.length; i++) {
      const anchor = this.#sortedAnchors[i];
      if (anchor > end) break;
      const path = this.#byAnchor.get(anchor);
      if (path === undefined) throw new InvariantError("sorted anchor missing from byAnchor map");
      out.set(anchor, path);
    }
    return out;
  }

  *[Symbol.iterator](): IterableIterator<readonly [AnchorString, VaultPath]> {
    for (const anchor of this.#sortedAnchors) {
      const path = this.#byAnchor.get(anchor);
      if (path === undefined) throw new InvariantError("sorted anchor missing from byAnchor map");
      yield [anchor, path] as const;
    }
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
}
