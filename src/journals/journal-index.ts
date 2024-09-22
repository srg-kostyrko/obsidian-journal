import type { JournalAnchorDate } from "@/types/journal.types";
import { ref } from "vue";

export class JournalIndex {
  map = ref(new Map<JournalAnchorDate, string>());
  #reversedMap = new Map<string, JournalAnchorDate>();

  get(anchorDate: JournalAnchorDate): string | null {
    return this.map.value.get(anchorDate) ?? null;
  }

  set(anchorDate: JournalAnchorDate, path: string) {
    this.map.value.set(anchorDate, path);
    this.#reversedMap.set(path, anchorDate);
  }

  delete(anchorDate: JournalAnchorDate) {
    const path = this.map.value.get(anchorDate);
    this.map.value.delete(anchorDate);
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
    const dates = Array.from(this.map.value.keys());
    dates.sort();
    const index = dates.indexOf(anchorDate);
    if (index === -1) return null;
    if (index === dates.length - 1) return null;
    return this.map.value.get(dates[index + 1]) ?? null;
  }

  findPrevious(anchorDate: JournalAnchorDate): string | null {
    const dates = Array.from(this.map.value.keys());
    dates.sort();
    const index = dates.indexOf(anchorDate);
    if (index === -1) return null;
    if (index === 0) return null;
    return this.map.value.get(dates[index - 1]) ?? null;
  }

  *[Symbol.iterator]() {
    yield* this.map.value;
  }
}
