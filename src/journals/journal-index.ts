import { dateDistance } from "@/calendar";
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
    return this.#map.value.get(this.#sortedDates[index + 1]) ?? null;
  }

  findPrevious(anchorDate: JournalAnchorDate): string | null {
    const index = this.#bsearchSortedDate(anchorDate);
    if (index === -1) return null;
    if (index === 0) return null;
    return this.#map.value.get(this.#sortedDates[index - 1]) ?? null;
  }

  findClosestDate(date: string): JournalAnchorDate | undefined {
    if (this.#map.value.size === 0) return;
    if (this.#map.value.has(date)) return JournalAnchorDate(date);
    if (date <= this.#sortedDates[0]) return JournalAnchorDate(this.#sortedDates[0]);
    const last = this.#sortedDates.at(-1);
    if (last && date >= last) return JournalAnchorDate(last);
    const index = this.#bsearchSortedDate(date);
    if (index === -1) return;
    if (this.#sortedDates[index] < date) {
      return dateDistance(this.#sortedDates[index], date) <= dateDistance(this.#sortedDates[index + 1], date)
        ? JournalAnchorDate(this.#sortedDates[index])
        : JournalAnchorDate(this.#sortedDates[index + 1]);
    }
    return dateDistance(this.#sortedDates[index], date) < dateDistance(this.#sortedDates[index - 1], date)
      ? JournalAnchorDate(this.#sortedDates[index])
      : JournalAnchorDate(this.#sortedDates[index - 1]);
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
      if (this.#sortedDates[mid] === date) return mid;
      if (this.#sortedDates[mid] < date) {
        start = mid;
      } else {
        end = mid;
      }
    }
    return start === 0 && this.#sortedDates[0] > date ? -1 : start;
  }
}
