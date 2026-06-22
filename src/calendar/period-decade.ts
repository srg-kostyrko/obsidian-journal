import { localMoment } from "./calendar";
import { CalendarDate } from "./calendar-date";
import { YearPeriod } from "./period-year";

import type { PeriodBase } from "./period";

const DECADE_LENGTH = 10;

export class DecadePeriod implements PeriodBase<DecadePeriod> {
  static containing(date: CalendarDate): DecadePeriod {
    return new DecadePeriod(Math.floor(date.year / DECADE_LENGTH) * DECADE_LENGTH);
  }

  readonly kind = "decade" as const;
  readonly start: CalendarDate;
  readonly end: CalendarDate;
  readonly anchor: CalendarDate;
  readonly decadeStart: number;

  private constructor(decadeStart: number) {
    this.decadeStart = decadeStart;

    const startMoment = localMoment(`${decadeStart}-01-01`, "YYYY-MM-DD", true);
    const endMoment = localMoment(`${decadeStart + DECADE_LENGTH - 1}-12-31`, "YYYY-MM-DD", true);

    this.start = CalendarDate._fromMoment(startMoment);
    this.end = CalendarDate._fromMoment(endMoment);
    this.anchor = this.start;
  }

  next(): DecadePeriod {
    return new DecadePeriod(this.decadeStart + DECADE_LENGTH);
  }

  previous(): DecadePeriod {
    return new DecadePeriod(this.decadeStart - DECADE_LENGTH);
  }

  contains(d: CalendarDate): boolean {
    return !d.isBefore(this.start) && !d.isAfter(this.end);
  }

  isSame(other: DecadePeriod): boolean {
    return this.decadeStart === other.decadeStart;
  }

  *days(): Iterable<CalendarDate> {
    let cursor = localMoment(this.start.toAnchor(), "YYYY-MM-DD", true);
    const endAnchor = this.end.toAnchor();
    while (cursor.format("YYYY-MM-DD") <= endAnchor) {
      yield CalendarDate._fromMoment(cursor);
      cursor = cursor.clone().add(1, "day");
    }
  }

  *years(): Iterable<YearPeriod> {
    let year = YearPeriod.containing(this.start);
    while (year.start.compareTo(this.end) <= 0) {
      yield year;
      year = year.next();
    }
  }

  format(pattern: string): string {
    return this.anchor.format(pattern);
  }
}
