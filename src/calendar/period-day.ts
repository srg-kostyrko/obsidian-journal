import { localMoment } from "./calendar";
import { CalendarDate } from "./calendar-date";

import type { PeriodBase } from "./period";

export class DayPeriod implements PeriodBase<DayPeriod> {
  readonly kind = "day" as const;
  readonly start: CalendarDate;
  readonly end: CalendarDate;
  readonly anchor: CalendarDate;

  private constructor(date: CalendarDate) {
    this.start = date;
    this.end = date;
    this.anchor = date;
  }

  static containing(date: CalendarDate): DayPeriod {
    return new DayPeriod(date);
  }

  next(): DayPeriod {
    const m = localMoment(this.start.toAnchor(), "YYYY-MM-DD", true).add(1, "day");
    return new DayPeriod(CalendarDate.fromMoment(m));
  }

  previous(): DayPeriod {
    const m = localMoment(this.start.toAnchor(), "YYYY-MM-DD", true).subtract(1, "day");
    return new DayPeriod(CalendarDate.fromMoment(m));
  }

  contains(d: CalendarDate): boolean {
    return this.start.isSame(d);
  }

  isSame(other: DayPeriod): boolean {
    return this.start.isSame(other.start);
  }

  *days(): Iterable<CalendarDate> {
    yield this.start;
  }

  format(pattern: string): string {
    return this.anchor.format(pattern);
  }
}
