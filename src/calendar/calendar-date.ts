import { Err, Ok, type Result } from "@/infrastructure/result";

import { localMoment } from "./calendar";
import { ParseError } from "./errors";

import type { AnchorString } from "./types";

const ANCHOR_FORMAT = "YYYY-MM-DD";

export class CalendarDate {
  readonly kind = "CalendarDate" as const;
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly #anchor: AnchorString;

  private constructor(year: number, month: number, day: number, anchor: AnchorString) {
    this.year = year;
    this.month = month;
    this.day = day;
    this.#anchor = anchor;
  }

  static today(): CalendarDate {
    return CalendarDate._fromMoment(localMoment().startOf("day"));
  }

  static parse(input: string, format?: string): Result<CalendarDate, ParseError> {
    const effectiveFormat = format ?? ANCHOR_FORMAT;
    const m = localMoment(input, effectiveFormat, true);
    if (!m.isValid()) {
      return new Err(new ParseError(input, format));
    }
    return new Ok(CalendarDate._fromMoment(m.startOf("day")));
  }

  static fromAnchor(s: AnchorString): CalendarDate {
    return CalendarDate._fromMoment(localMoment(s, ANCHOR_FORMAT, true));
  }

  static _fromMoment(m: ReturnType<typeof localMoment>): CalendarDate {
    return new CalendarDate(m.year(), m.month() + 1, m.date(), m.format(ANCHOR_FORMAT) as AnchorString);
  }

  toAnchor(): AnchorString {
    return this.#anchor;
  }

  format(pattern: string): string {
    return localMoment(this.#anchor, ANCHOR_FORMAT, true).format(pattern);
  }

  isBefore(other: CalendarDate): boolean {
    return this.compareTo(other) < 0;
  }

  isAfter(other: CalendarDate): boolean {
    return this.compareTo(other) > 0;
  }

  isSame(other: CalendarDate): boolean {
    return this.compareTo(other) === 0;
  }

  compareTo(other: CalendarDate): -1 | 0 | 1 {
    if (this.#anchor === other.#anchor) return 0;
    return this.#anchor < other.#anchor ? -1 : 1;
  }
}
