import { Err, Ok, type Result } from "@/infrastructure/result";

import { localMoment } from "./calendar";
import { CalendarDate } from "./calendar-date";
import { IntervalError } from "./errors";

export class Interval {
  readonly kind = "Interval" as const;
  readonly start: CalendarDate;
  readonly end: CalendarDate;

  private constructor(start: CalendarDate, end: CalendarDate) {
    this.start = start;
    this.end = end;
  }

  static between(start: CalendarDate, end: CalendarDate): Result<Interval, IntervalError> {
    if (start.isAfter(end)) {
      return new Err(new IntervalError(start, end));
    }
    return new Ok(new Interval(start, end));
  }

  contains(d: CalendarDate): boolean {
    return !d.isBefore(this.start) && !d.isAfter(this.end);
  }

  isSame(other: Interval): boolean {
    return this.start.isSame(other.start) && this.end.isSame(other.end);
  }

  *days(): Iterable<CalendarDate> {
    let cursor = localMoment(this.start.toAnchor(), "YYYY-MM-DD", true);
    const endAnchor = this.end.toAnchor();
    while (cursor.format("YYYY-MM-DD") <= endAnchor) {
      yield CalendarDate.fromMoment(cursor);
      cursor = cursor.clone().add(1, "day");
    }
  }
}
