import IntervalTree from "@flatten-js/interval-tree";
import { CalendarGranularity } from "../contracts/config.types";
import { MomentDate } from "../contracts/date.types";

interface IndexEntry {
  path: string;
  granularity: CalendarGranularity;
}

export class CalendarIndex {
  private intervalTree = new IntervalTree<IndexEntry>();

  get(date: MomentDate, granularity: CalendarGranularity): IndexEntry | undefined {
    const list = this.intervalTree.search([date.toDate().getTime(), date.toDate().getTime()]);
    return list.find((entry) => entry.granularity === granularity);
  }

  add(startDate: MomentDate, endDate: MomentDate, value: IndexEntry): void {
    const interval: [number, number] = [startDate.toDate().getTime(), endDate.toDate().getTime()];
    this.intervalTree.insert(interval, value);
  }

  clearForPath(path: string): void {
    for (const [key, entry] of this.intervalTree.iterate(undefined, (value, key) => [key, value])) {
      if (entry?.path === path) {
        this.intervalTree.remove(key, entry);
      }
    }
  }
}
