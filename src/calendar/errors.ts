import type { CalendarDate } from "./calendar-date";

export class DateTimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DateTimeError";
  }
}

export class ParseError extends DateTimeError {
  constructor(
    readonly input: string,
    readonly format?: string,
  ) {
    super(format ? `Cannot parse "${input}" with format "${format}"` : `Cannot parse "${input}"`);
    this.name = "ParseError";
  }
}

export class DateFormatError extends DateTimeError {
  constructor(
    readonly pattern: string,
    readonly reason: string,
  ) {
    super(`Cannot render date format "${pattern}": ${reason}`);
    this.name = "DateFormatError";
  }
}

export class IntervalError extends DateTimeError {
  constructor(
    readonly start: CalendarDate,
    readonly end: CalendarDate,
  ) {
    super(`Interval start ${start.toAnchor()} is after end ${end.toAnchor()}`);
    this.name = "IntervalError";
  }
}
