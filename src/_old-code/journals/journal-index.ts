import { JournalAnchorDate } from "@/types/journal.types";
import { ref } from "vue";

export class JournalIndex {
  #map = ref(new Map<string, string>());
  #reversedMap = new Map<string, JournalAnchorDate>();
  #sortedDates: string[] = [];

  has(anchorDate: JournalAnchorDate): boolean {
    return this.#map.value.has(anchorDate);
  }

  get(anchorDate: JournalAnchorDate): string | null {
    return this.#map.value.get(anchorDate) ?? null;
  }

  getAll(): string[] {
    return [...this.#map.value.values()];
  }

  set(anchorDate: JournalAnchorDate, path: string) {
    const has = this.#map.value.has(anchorDate);
    this.#map.value.set(anchorDate, path);
    this.#reversedMap.set(path, anchorDate);
    if (!has) {
      this.#insertSortedDate(anchorDate);
    }
  }

  delete(anchorDate: JournalAnchorDate) {
    const path = this.#map.value.get(anchorDate);
    this.#map.value.delete(anchorDate);
    if (path) {
      this.#reversedMap.delete(path);
    }
    this.#removeSortedDate(anchorDate);
  }

  deleteForPath(path: string) {
    const anchorDate = this.#reversedMap.get(path);
    if (anchorDate) {
      this.delete(anchorDate);
    }
  }

  findNext(anchorDate: JournalAnchorDate): string | null {
    const index = this.#bsearchSortedDate(anchorDate);
    if (index === -1) return null;
    if (index === this.#sortedDates.length - 1) return null;
    const nextDate = this.#sortedDates[index + 1];
    return nextDate ? (this.#map.value.get(nextDate) ?? null) : null;
  }

  findPrevious(anchorDate: JournalAnchorDate): string | null {
    const index = this.#bsearchSortedDate(anchorDate);
    if (index === -1) return null;
    if (index === 0) return null;
    const previousDate = this.#sortedDates[index - 1];
    return previousDate ? (this.#map.value.get(previousDate) ?? null) : null;
  }

  findClosestDate(date: string): JournalAnchorDate | undefined {
    if (this.#map.value.size === 0) return;
    if (this.#map.value.has(date)) return JournalAnchorDate(date);
    const first = this.#sortedDates[0];
    if (first && date <= first) return JournalAnchorDate(first);
    const last = this.#sortedDates.at(-1);
    if (last && date >= last) return JournalAnchorDate(last);
    const index = this.#bsearchSortedDate(date);
    if (index === -1) return;
    return this.#sortedDates[index] ? JournalAnchorDate(this.#sortedDates[index]) : undefined;
  }

  *[Symbol.iterator]() {
    yield* this.#map.value;
  }

  #insertSortedDate(date: string) {
    const pos = this.#bsearchSortedDate(date);
    this.#sortedDates.splice(pos + 1, 0, date);
    return pos + 1;
  }

  #removeSortedDate(date: string) {
    const pos = this.#bsearchSortedDate(date);
    if (pos === -1) return;
    this.#sortedDates.splice(pos, 1);
  }

  #bsearchSortedDate(date: string) {
    if (this.#sortedDates.length === 0) return -1;
    let start = 0;
    let end = this.#sortedDates.length;
    while (end - start > 1) {
      const mid = Math.floor((start + end) / 2);
      const midDate = this.#sortedDates[mid];
      if (!midDate) break;
      if (midDate === date) return mid;
      if (midDate < date) {
        start = mid;
      } else {
        end = mid;
      }
    }
    return start === 0 && this.#sortedDates[0] && this.#sortedDates[0] > date ? -1 : start;
  }
}
