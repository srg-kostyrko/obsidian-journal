import { localMoment } from "./calendar";
import { CalendarDate } from "./calendar-date";
import { MonthPeriod } from "./period-month";

import type { PeriodBase } from "./period";

export class QuarterPeriod implements PeriodBase<QuarterPeriod> {
  readonly kind = "quarter" as const;
  readonly start: CalendarDate;
  readonly end: CalendarDate;
  readonly anchor: CalendarDate;
  readonly quarterOfYear: 1 | 2 | 3 | 4;
  readonly year: number;

  private constructor(reference: ReturnType<typeof localMoment>) {
    const start = reference.clone().startOf("quarter");
    const end = reference.clone().endOf("quarter").startOf("day");

    this.start = CalendarDate._fromMoment(start);
    this.end = CalendarDate._fromMoment(end);
    this.anchor = this.start;
    this.quarterOfYear = start.quarter() as 1 | 2 | 3 | 4;
    this.year = start.year();
  }

  static containing(date: CalendarDate): QuarterPeriod {
    return new QuarterPeriod(localMoment(date.toAnchor(), "YYYY-MM-DD", true));
  }

  next(): QuarterPeriod {
    return new QuarterPeriod(localMoment(this.start.toAnchor(), "YYYY-MM-DD", true).add(1, "quarter"));
  }

  previous(): QuarterPeriod {
    return new QuarterPeriod(localMoment(this.start.toAnchor(), "YYYY-MM-DD", true).subtract(1, "quarter"));
  }

  contains(d: CalendarDate): boolean {
    return !d.isBefore(this.start) && !d.isAfter(this.end);
  }

  isSame(other: QuarterPeriod): boolean {
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

  *months(): Iterable<MonthPeriod> {
    let month = MonthPeriod.containing(this.start);
    while (month.start.compareTo(this.end) <= 0) {
      yield month;
      month = month.next();
    }
  }

  format(pattern: string): string {
    return this.anchor.format(pattern);
  }
}
