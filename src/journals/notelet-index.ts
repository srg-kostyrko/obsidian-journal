import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";

import type { NoteletEntry } from "./types";

const EMPTY: readonly VaultPath[] = [];

interface Placement {
  readonly anchor: AnchorString;
  readonly typeName: string;
}

export class NoteletIndex {
  readonly #byAnchor = new Map<AnchorString, VaultPath[]>();
  readonly #byType = new Map<string, VaultPath[]>();
  readonly #placements = new Map<VaultPath, Placement>();

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

  add(entry: NoteletEntry): void {
    const prior = this.#placements.get(entry.path);
    if (prior !== undefined) {
      this.#drop(this.#byAnchor, prior.anchor, entry.path);
      this.#drop(this.#byType, prior.typeName, entry.path);
    }
    this.#push(this.#byAnchor, entry.anchor, entry.path);
    this.#push(this.#byType, entry.typeName, entry.path);
    this.#placements.set(entry.path, { anchor: entry.anchor, typeName: entry.typeName });
  }

  remove(entry: NoteletEntry): void {
    const placement = this.#placements.get(entry.path);
    if (placement === undefined) return;
    this.#drop(this.#byAnchor, placement.anchor, entry.path);
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

  clear(): void {
    this.#byAnchor.clear();
    this.#byType.clear();
    this.#placements.clear();
  }
}
