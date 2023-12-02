import IntervalTree from "@flatten-js/interval-tree";
import { MomentDate } from "../contracts/date.types";
import { IntervalConfig } from "../contracts/config.types";
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

  constructor(
    private config: IntervalConfig,
    private calendar: CalendarHelper,
  ) {}

  findInterval(date?: string): Interval {
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
      return this.calculateIntervalBeforeKnown(intervalDate, startInterval);
    } else if (intervalDate.isAfter(startInterval.endDate, "day")) {
      return this.calculateIntervalAfterKnown(intervalDate, startInterval);
    }
    return startInterval;
  }

  add(interval: Interval): void {
    const dateInterval: [number, number] = [interval.startDate.toDate().getTime(), interval.endDate.toDate().getTime()];
    this.intervalTree.insert(dateInterval, interval);
    this.keysMap.set(this.getIntervalKey(interval), interval);
  }

  clearForPath(path: string): void {
    for (const [key, entry] of this.intervalTree.iterate(undefined, (value, key) => [key, value])) {
      if (entry?.path === path) {
        this.intervalTree.remove(key, entry);
      }
    }
  }

  private getIntervalKey(interval: Interval): string {
    if (this.config.numeration_type === "year") {
      return `${interval.startDate.toDate().getFullYear()}_${interval.index}`;
    }
    return `${interval.index}`;
  }

  private getStartInterval(): Interval {
    const startDate = this.calendar.date(this.config.start_date);
    const endDate = startDate.clone().add(this.config.duration, this.config.granularity);
    return {
      startDate,
      endDate,
      index: this.config.start_index,
    };
  }

  private calculateIntervalAfterKnown(date: MomentDate, interval: Interval): Interval {
    // TODO add calculation
    return interval;
  }

  private calculateIntervalBeforeKnown(date: MomentDate, interval: Interval): Interval {
    // TODO add calculation
    return interval;
  }
}
