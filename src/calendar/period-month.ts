import { localMoment } from "./calendar";
import { CalendarDate } from "./calendar-date";
import { WeekPeriod } from "./period-week";

import type { PeriodBase } from "./period";

export class MonthPeriod implements PeriodBase<MonthPeriod> {
  static containing(date: CalendarDate): MonthPeriod {
    return new MonthPeriod(localMoment(date.toAnchor(), "YYYY-MM-DD", true));
  }

  readonly kind = "month" as const;
  readonly start: CalendarDate;
  readonly end: CalendarDate;
  readonly anchor: CalendarDate;
  readonly representative: CalendarDate;
  readonly monthOfYear: number;
  readonly year: number;

  private constructor(reference: ReturnType<typeof localMoment>) {
    const start = reference.clone().startOf("month");
    const end = reference.clone().endOf("month").startOf("day");

    this.start = CalendarDate._fromMoment(start);
    this.end = CalendarDate._fromMoment(end);
    this.anchor = this.start;
    this.representative = this.start;
    this.monthOfYear = start.month() + 1;
    this.year = start.year();
  }

  next(): MonthPeriod {
    const m = localMoment(this.start.toAnchor(), "YYYY-MM-DD", true).add(1, "month");
    return new MonthPeriod(m);
  }

  previous(): MonthPeriod {
    const m = localMoment(this.start.toAnchor(), "YYYY-MM-DD", true).subtract(1, "month");
    return new MonthPeriod(m);
  }

  contains(d: CalendarDate): boolean {
    return !d.isBefore(this.start) && !d.isAfter(this.end);
  }

  isSame(other: MonthPeriod): boolean {
    return this.start.isSame(other.start);
  }

  *days(): Iterable<CalendarDate> {
    let cursor = localMoment(this.start.toAnchor(), "YYYY-MM-DD", true);
    const endAnchor = this.end.toAnchor();
    while (cursor.format("YYYY-MM-DD") <= endAnchor) {
      yield CalendarDate._fromMoment(cursor);
      cursor = cursor.clone().add(1, "day");
    }
  }

  *weeks(): Iterable<WeekPeriod> {
    let week = WeekPeriod.containing(this.start);
    while (week.start.compareTo(this.end) <= 0) {
      yield week;
      week = week.next();
    }
  }

  format(pattern: string): string {
    return this.representative.format(pattern);
  }
}
