import IntervalTree from "@flatten-js/interval-tree";
import type { CalendarGranularity } from "../contracts/config.types";
import type { MomentDate } from "../contracts/date.types";

interface IndexEntry {
  path: string;
  startDate: string;
  endDate: string;
  granularity: CalendarGranularity;
}

export class CalendarIndex {
  private intervalTree = new IntervalTree<IndexEntry>();

  find(startDate: MomentDate, endDate: MomentDate): IndexEntry[] {
    return this.intervalTree.search([startDate.toDate().getTime(), endDate.toDate().getTime()]) as IndexEntry[];
  }

  get(date: MomentDate, granularity: CalendarGranularity): IndexEntry | undefined {
    const list = this.intervalTree.search([date.toDate().getTime(), date.toDate().getTime()]);
    return list.find((entry) => entry.granularity === granularity);
  }

  add(startDate: MomentDate, endDate: MomentDate, value: IndexEntry): void {
    const interval: [number, number] = [startDate.toDate().getTime(), endDate.toDate().getTime()];
    this.intervalTree.insert(interval, value);
  }

  findNextNote(endDate: MomentDate, granularity: CalendarGranularity): string | null {
    const list = this.intervalTree.search([endDate.toDate().getTime(), Infinity]) as IndexEntry[];
    const [note] = list.filter((entry) => entry.granularity === granularity);
    return note?.path ?? null;
  }

  findPreviousNote(startDate: MomentDate, granularity: CalendarGranularity): string | null {
    const list = this.intervalTree.search([0, startDate.toDate().getTime()]) as IndexEntry[];
    const note = list.filter((entry) => entry.granularity === granularity).pop();
    return note?.path ?? null;
  }

  clearForPath(path: string): void {
    if (!this.intervalTree.size) return;
    const toDelete = [];
    for (const [key, entry] of this.intervalTree.iterate(undefined, (value, key) => [key, value])) {
      if (entry?.path === path) {
        toDelete.push([key, entry]);
      }
    }
    for (const [key, entry] of toDelete) {
      this.intervalTree.remove(key, entry);
    }
  }

  *[Symbol.iterator](): Iterator<IndexEntry> {
    for (const entry of this.intervalTree.iterate()) {
      yield entry;
    }
  }
}
