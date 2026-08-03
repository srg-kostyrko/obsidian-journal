import { localMoment } from "./calendar";
import { CalendarDate } from "./calendar-date";

import type { PeriodBase } from "./period";

export class WeekPeriod implements PeriodBase<WeekPeriod> {
  static containing(date: CalendarDate): WeekPeriod {
    return new WeekPeriod(localMoment(date.toAnchor(), "YYYY-MM-DD", true));
  }

  // Seeded mid-year rather than from "now": setting weekYear while the current instant sits in
  // week 53 clamps in a 52-week target year, and June 15 is in week-year Y for every Y and grid.
  static ofWeek(weekYear: number, weekOfYear: number): WeekPeriod {
    const seed = localMoment(`${weekYear}-06-15`, "YYYY-MM-DD", true);
    return new WeekPeriod(seed.weekYear(weekYear).week(weekOfYear));
  }

  readonly kind = "week" as const;
  readonly start: CalendarDate;
  readonly end: CalendarDate;
  readonly anchor: CalendarDate;
  readonly representative: CalendarDate;
  readonly weekOfYear: number;
  readonly year: number;

  private constructor(reference: ReturnType<typeof localMoment>) {
    const start = reference.clone().startOf("week");
    const end = reference.clone().endOf("week").startOf("day");
    const doy = reference.localeData().firstDayOfYear();

    this.start = CalendarDate._fromMoment(start);
    this.end = CalendarDate._fromMoment(end);
    this.anchor = this.start;
    // The locale's representative day: the one whose calendar year is the week-year, so
    // {{date:YYYY}} resolves correctly for a week straddling January 1.
    this.representative = CalendarDate._fromMoment(start.clone().add(doy - 1, "day"));
    this.weekOfYear = reference.week();
    this.year = reference.weekYear();
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
      yield CalendarDate._fromMoment(cursor);
      cursor = cursor.clone().add(1, "day");
    }
  }

  format(pattern: string): string {
    return this.representative.format(pattern);
  }
}
