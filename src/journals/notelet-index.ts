import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";

import type { NoteletEntry } from "./types";

const EMPTY: readonly VaultPath[] = [];

export class NoteletIndex {
  readonly #byAnchor = new Map<AnchorString, VaultPath[]>();
  readonly #byType = new Map<string, VaultPath[]>();
  #size = 0;

  #push<K>(map: Map<K, VaultPath[]>, key: K, path: VaultPath): boolean {
    const bucket = map.get(key);
    if (bucket === undefined) {
      map.set(key, [path]);
      return true;
    }
    if (bucket.includes(path)) return false;
    bucket.push(path);
    return true;
  }

  #drop<K>(map: Map<K, VaultPath[]>, key: K, path: VaultPath): void {
    const bucket = map.get(key);
    if (bucket === undefined) return;
    const at = bucket.indexOf(path);
    if (at === -1) return;
    bucket.splice(at, 1);
    if (bucket.length === 0) map.delete(key);
  }

  add(entry: NoteletEntry): void {
    const added = this.#push(this.#byAnchor, entry.anchor, entry.path);
    this.#push(this.#byType, entry.typeName, entry.path);
    if (added) this.#size++;
  }

  remove(entry: NoteletEntry): void {
    const had = this.#byAnchor.get(entry.anchor)?.includes(entry.path) ?? false;
    this.#drop(this.#byAnchor, entry.anchor, entry.path);
    this.#drop(this.#byType, entry.typeName, entry.path);
    if (had) this.#size--;
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

  clear(): void {
    this.#byAnchor.clear();
    this.#byType.clear();
    this.#size = 0;
  }

  get size(): number {
    return this.#size;
  }
}
