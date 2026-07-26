import { localMoment } from "./calendar";
import { CalendarDate } from "./calendar-date";
import { MonthPeriod } from "./period-month";
import { QuarterPeriod } from "./period-quarter";

import type { PeriodBase } from "./period";

export class YearPeriod implements PeriodBase<YearPeriod> {
  static containing(date: CalendarDate): YearPeriod {
    return new YearPeriod(localMoment(date.toAnchor(), "YYYY-MM-DD", true));
  }

  readonly kind = "year" as const;
  readonly start: CalendarDate;
  readonly end: CalendarDate;
  readonly anchor: CalendarDate;
  readonly representative: CalendarDate;
  readonly year: number;

  private constructor(reference: ReturnType<typeof localMoment>) {
    const start = reference.clone().startOf("year");
    const end = reference.clone().endOf("year").startOf("day");

    this.start = CalendarDate._fromMoment(start);
    this.end = CalendarDate._fromMoment(end);
    this.anchor = this.start;
    this.representative = this.start;
    this.year = start.year();
  }

  next(): YearPeriod {
    return new YearPeriod(localMoment(this.start.toAnchor(), "YYYY-MM-DD", true).add(1, "year"));
  }

  previous(): YearPeriod {
    return new YearPeriod(localMoment(this.start.toAnchor(), "YYYY-MM-DD", true).subtract(1, "year"));
  }

  contains(d: CalendarDate): boolean {
    return !d.isBefore(this.start) && !d.isAfter(this.end);
  }

  isSame(other: YearPeriod): boolean {
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

  *quarters(): Iterable<QuarterPeriod> {
    let quarter = QuarterPeriod.containing(this.start);
    while (quarter.start.compareTo(this.end) <= 0) {
      yield quarter;
      quarter = quarter.next();
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
    return this.representative.format(pattern);
  }
}
