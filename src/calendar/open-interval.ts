import { Err, Ok, Option, type Result } from "@/infrastructure/result";

import { IntervalError } from "./errors";

import type { CalendarDate } from "./calendar-date";
import type { Period } from "./period";

export class OpenInterval {
  static from(start: CalendarDate): OpenInterval {
    return new OpenInterval(Option.some(start), Option.none());
  }

  static until(end: CalendarDate): OpenInterval {
    return new OpenInterval(Option.none(), Option.some(end));
  }

  static between(start: CalendarDate, end: CalendarDate): Result<OpenInterval, IntervalError> {
    if (start.isAfter(end)) {
      return new Err(new IntervalError(start, end));
    }
    return new Ok(new OpenInterval(Option.some(start), Option.some(end)));
  }

  private static optionDatesEqual(a: Option<CalendarDate>, b: Option<CalendarDate>): boolean {
    if (a.isSome() && b.isSome()) return a.value.isSame(b.value);
    return a.isNone() && b.isNone();
  }

  readonly kind = "OpenInterval" as const;
  readonly start: Option<CalendarDate>;
  readonly end: Option<CalendarDate>;

  private constructor(start: Option<CalendarDate>, end: Option<CalendarDate>) {
    this.start = start;
    this.end = end;
  }

  contains(d: CalendarDate): boolean {
    const afterStart = this.start.match({
      some: (s) => !d.isBefore(s),
      none: () => true,
    });
    const beforeEnd = this.end.match({
      some: (endDate) => !d.isAfter(endDate),
      none: () => true,
    });
    return afterStart && beforeEnd;
  }

  overlapsPeriod(p: Period): boolean {
    const startOk = this.end.match({
      some: (endDate) => !p.start.isAfter(endDate),
      none: () => true,
    });
    const endOk = this.start.match({
      some: (s) => !p.end.isBefore(s),
      none: () => true,
    });
    return startOk && endOk;
  }

  isSame(other: OpenInterval): boolean {
    return OpenInterval.optionDatesEqual(this.start, other.start) && OpenInterval.optionDatesEqual(this.end, other.end);
  }
}
