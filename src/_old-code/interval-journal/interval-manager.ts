import IntervalTree from "@flatten-js/interval-tree";
import type { MomentDate } from "../contracts/date.types";
import type { IntervalConfig } from "../contracts/config.types";
import { CalendarHelper } from "../utils/calendar";

export interface Interval {
  startDate: MomentDate;
  endDate: MomentDate;
  index: number;
  path?: string;
}

export class IntervalManager {
  private intervalTree = new IntervalTree<Interval>();
  private keysMap = new Map<string, Interval>();

  private maximumYearIndex = 0;

  constructor(
    private config: IntervalConfig,
    private calendar: CalendarHelper,
  ) {
    if (this.shouldResetYearly) {
      this.calculateMaximumYearIndex();
    }
  }

  get shouldResetYearly(): boolean {
    return this.config.numeration_type === "year";
  }

  find(startDate: MomentDate, endDate: MomentDate): Interval[] {
    return this.intervalTree.search([startDate.toDate().getTime(), endDate.toDate().getTime()]) as Interval[];
  }

  findInterval(date?: string): Interval | null {
    const intervalDate = date ? this.calendar.date(date) : this.calendar.today();
    const intervalTime = intervalDate.toDate().getTime();
    const list = this.intervalTree.search([intervalTime, intervalTime]);
    if (list.length > 0) {
      return list[0];
    }
    const pastDate = intervalDate.clone().subtract(100, "year").toDate().getTime();
    const pastList = this.intervalTree.search([pastDate, intervalTime]);
    if (pastList.length > 0) {
      return this.calculateIntervalAfterKnown(intervalDate, pastList.at(-1));
    }
    const futureDate = intervalDate.clone().add(100, "year").toDate().getTime();
    const futureList = this.intervalTree.search([intervalTime, futureDate]);
    if (futureList.length > 0) {
      return this.calculateIntervalBeforeKnown(intervalDate, futureList[0]);
    }
    const startInterval = this.getStartInterval();
    if (intervalDate.isBefore(startInterval.startDate, "day")) {
      if (this.config.limitCreation) return null;
      return this.calculateIntervalBeforeKnown(intervalDate, startInterval);
    } else if (intervalDate.isAfter(startInterval.endDate, "day")) {
      return this.calculateIntervalAfterKnown(intervalDate, startInterval);
    }
    return startInterval;
  }

  findNextInterval(date?: string): Interval | null {
    const interval = this.findInterval(date);
    if (!interval) return null;
    return this.calculateIntervalAfterKnown(interval.endDate.clone().add(1, "day"), interval);
  }

  findPreviousInterval(date?: string): Interval | null {
    const interval = this.findInterval(date);
    if (!interval) return null;
    return this.calculateIntervalBeforeKnown(interval.startDate.clone().subtract(1, "day"), interval);
  }

  add(interval: Interval): void {
    const dateInterval: [number, number] = [interval.startDate.toDate().getTime(), interval.endDate.toDate().getTime()];
    this.intervalTree.insert(dateInterval, interval);
    this.keysMap.set(this.getIntervalKey(interval), interval);
  }

  findNextNote(endDate: MomentDate): string | null {
    const list = this.intervalTree.search([endDate.toDate().getTime(), Infinity]) as Interval[];
    const note = list.pop();
    return note?.path ?? null;
  }

  findPreviousNote(startDate: MomentDate): string | null {
    const list = this.intervalTree.search([0, startDate.toDate().getTime()]) as Interval[];
    const [note] = list;
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

  private getIntervalKey(interval: Interval): string {
    if (this.shouldResetYearly) {
      return `${interval.startDate.toDate().getFullYear()}_${interval.index}`;
    }
    return `${interval.index}`;
  }

  private getStartInterval(): Interval {
    const startDate = this.calendar.date(this.config.start_date).startOf("day");
    const endDate = this.createEndDate(startDate);
    return {
      startDate,
      endDate,
      index: this.config.start_index,
    };
  }

  private createEndDate(startDate: MomentDate): MomentDate {
    return startDate.clone().add(this.config.duration, this.config.granularity).subtract(1, "day").endOf("day");
  }

  private calculateIntervalAfterKnown(date: MomentDate, interval: Interval): Interval | null {
    let current = interval.endDate.clone().add(1, "day");
    let index = interval.index + 1;
    if (this.shouldResetYearly && !current.isSame(interval.startDate, "year")) {
      index = 1;
    }
    while (current.isBefore(date, "day")) {
      const next = current.clone().add(this.config.duration, this.config.granularity);
      if (next.isAfter(date, "day")) {
        break;
      }
      index++;
      if (this.shouldResetYearly && !next.isSame(current, "year")) {
        index = 1;
      }
      current = next;
    }
    switch (this.config.end_type) {
      case "date":
        if (current.isAfter(this.calendar.date(this.config.end_date), "day")) {
          return null;
        }
        break;
      case "repeats":
        if (index >= this.config.start_index + this.config.repeats) {
          return null;
        }
    }
    return {
      startDate: current,
      endDate: this.createEndDate(current),
      index,
    };
  }

  private calculateIntervalBeforeKnown(date: MomentDate, interval: Interval): Interval | null {
    const current = interval.startDate.clone();
    let index = interval.index;
    while (current.isAfter(date, "day")) {
      current.subtract(this.config.duration, this.config.granularity);
      index--;
      if (this.shouldResetYearly && index === 0) {
        index = this.maximumYearIndex;
      }
    }
    if (this.config.limitCreation && current.isBefore(this.calendar.date(this.config.start_date))) {
      return null;
    }
    return {
      startDate: current,
      endDate: this.createEndDate(current),
      index,
    };
  }

  private calculateMaximumYearIndex(): void {
    const duration = this.config.duration;
    switch (this.config.granularity) {
      case "month":
        this.maximumYearIndex = Math.floor(12 / duration);
        break;
      case "week":
        this.maximumYearIndex = Math.floor(52 / duration);
        break;
      case "day":
        this.maximumYearIndex = Math.floor(365 / duration);
        break;
    }
  }

  *[Symbol.iterator](): IterableIterator<Interval> {
    if (!this.intervalTree.size) return;
    for (const entry of this.intervalTree.iterate()) {
      yield entry;
    }
  }
}
