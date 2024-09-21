import type { JournalAnchorDate } from "@/types/journal.types";

export class JournalIndex {
  #map = new Map<JournalAnchorDate, string>();
  #reversedMap = new Map<string, JournalAnchorDate>();

  get(anchorDate: JournalAnchorDate): string | null {
    return this.#map.get(anchorDate) ?? null;
  }

  set(anchorDate: JournalAnchorDate, path: string) {
    this.#map.set(anchorDate, path);
    this.#reversedMap.set(path, anchorDate);
  }

  delete(anchorDate: JournalAnchorDate) {
    const path = this.#map.get(anchorDate);
    this.#map.delete(anchorDate);
    if (path) {
      this.#reversedMap.delete(path);
    }
  }

  deleteForPath(path: string) {
    const anchorDate = this.#reversedMap.get(path);
    if (anchorDate) {
      this.delete(anchorDate);
    }
  }

  findNext(anchorDate: JournalAnchorDate): string | null {
    const dates = Array.from(this.#map.keys());
    dates.sort();
    const index = dates.indexOf(anchorDate);
    if (index === -1) return null;
    if (index === dates.length - 1) return null;
    return this.#map.get(dates[index + 1]) ?? null;
  }

  findPrevious(anchorDate: JournalAnchorDate): string | null {
    const dates = Array.from(this.#map.keys());
    dates.sort();
    const index = dates.indexOf(anchorDate);
    if (index === -1) return null;
    if (index === 0) return null;
    return this.#map.get(dates[index - 1]) ?? null;
  }

  *[Symbol.iterator]() {
    yield* this.#map;
  }
}
