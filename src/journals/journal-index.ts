import { dateDistance } from "@/calendar";
import type { JournalAnchorDate } from "@/types/journal.types";
import { ref } from "vue";

export class JournalIndex {
  map = ref(new Map<JournalAnchorDate, string>());
  #reversedMap = new Map<string, JournalAnchorDate>();

  has(anchorDate: JournalAnchorDate): boolean {
    return this.map.value.has(anchorDate);
  }

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

  findClosestDate(date: string): JournalAnchorDate | undefined {
    const dates = Array.from(this.map.value.keys());
    dates.sort();
    if (!dates.length) return;
    if (date <= dates[0]) return dates[0];
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (date >= dates.at(-1)!) return dates.at(-1);
    for (let i = 0; i < dates.length - 1; i++) {
      if (dates[i] <= date && dates[i + 1] > date) {
        return dateDistance(dates[i], date) <= dateDistance(dates[i + 1], date) ? dates[i] : dates[i + 1];
      }
    }
  }

  *[Symbol.iterator]() {
    yield* this.map.value;
  }
}
