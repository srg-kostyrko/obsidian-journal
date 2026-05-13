import { localMoment } from "./calendar";
import { CalendarDate } from "./calendar-date";

import type { PeriodBase } from "./period";

export class WeekPeriod implements PeriodBase<WeekPeriod> {
  readonly kind = "week" as const;
  readonly start: CalendarDate;
  readonly end: CalendarDate;
  readonly anchor: CalendarDate;
  readonly weekOfYear: number;
  readonly year: number;

  private constructor(reference: ReturnType<typeof localMoment>) {
    const start = reference.clone().startOf("week");
    const end = reference.clone().endOf("week").startOf("day");
    // ISO 8601: Thursday is weekday(3) from a Monday-start locale (dow=1)
    const anchor = reference.clone().weekday(3);

    this.start = CalendarDate.fromMoment(start);
    this.end = CalendarDate.fromMoment(end);
    this.anchor = CalendarDate.fromMoment(anchor);
    this.weekOfYear = reference.week();
    this.year = reference.weekYear();
  }

  static containing(date: CalendarDate): WeekPeriod {
    return new WeekPeriod(localMoment(date.toAnchor(), "YYYY-MM-DD", true));
  }

  next(): WeekPeriod {
    const m = localMoment(this.start.toAnchor(), "YYYY-MM-DD", true).add(1, "week");
    return new WeekPeriod(m);
  }

  previous(): WeekPeriod {
    const m = localMoment(this.start.toAnchor(), "YYYY-MM-DD", true).subtract(1, "week");
    return new WeekPeriod(m);
  }

  contains(d: CalendarDate): boolean {
    return !d.isBefore(this.start) && !d.isAfter(this.end);
  }

  isSame(other: WeekPeriod): boolean {
    return this.start.isSame(other.start);
  }

  *days(): Iterable<CalendarDate> {
    let cursor = localMoment(this.start.toAnchor(), "YYYY-MM-DD", true);
    const endAnchor = this.end.toAnchor();
    while (cursor.format("YYYY-MM-DD") <= endAnchor) {
      yield CalendarDate.fromMoment(cursor);
      cursor = cursor.clone().add(1, "day");
    }
  }

  format(pattern: string): string {
    return this.anchor.format(pattern);
  }
}
