import { Err, Ok, type Result } from "@/infrastructure/result";

import { localMoment } from "./calendar";
import { ParseError } from "./errors";

import type { AnchorString } from "./types";

const ANCHOR_FORMAT = "YYYY-MM-DD";

export class CalendarDate {
  static today(): CalendarDate {
    return this._fromMoment(localMoment().startOf("day"));
  }

  static parse(input: string, format?: string): Result<CalendarDate, ParseError> {
    const effectiveFormat = format ?? ANCHOR_FORMAT;
    const m = localMoment(input, effectiveFormat, true);
    if (!m.isValid()) {
      return new Err(new ParseError(input, format));
    }
    return new Ok(this._fromMoment(m.startOf("day")));
  }

  static fromAnchor(s: AnchorString): CalendarDate {
    return this._fromMoment(localMoment(s, ANCHOR_FORMAT, true));
  }

  static _fromMoment(m: ReturnType<typeof localMoment>): CalendarDate {
    return new CalendarDate(m.year(), m.month() + 1, m.date(), m.format(ANCHOR_FORMAT) as AnchorString);
  }

  readonly #anchor: AnchorString;

  readonly kind = "CalendarDate" as const;
  readonly year: number;
  readonly month: number;
  readonly day: number;

  private constructor(year: number, month: number, day: number, anchor: AnchorString) {
    this.year = year;
    this.month = month;
    this.day = day;
    this.#anchor = anchor;
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

  shift(amount: number, unit: "y" | "q" | "m" | "w" | "d" | "h"): CalendarDate {
    // CalendarDate has day-level precision; hour shifts are accepted for grammar parity but ignored.
    if (unit === "h") return this;
    // moment uses uppercase "M"/"Q"; map from domain shorthand
    const unitMap = { y: "y", q: "Q", m: "M", w: "w", d: "d" } as const;
    const m = localMoment(this.#anchor, ANCHOR_FORMAT, true).add(amount, unitMap[unit]);
    return CalendarDate._fromMoment(m);
  }

  startOf(unit: "year" | "quarter" | "month" | "week" | "day" | "decade" | "hour"): CalendarDate {
    // CalendarDate has day-level precision; hour boundaries are accepted for Shiftable parity but are no-ops.
    if (unit === "hour") return this;
    if (unit === "decade") {
      const m = localMoment(this.#anchor, ANCHOR_FORMAT, true);
      const startYear = m.year() - (m.year() % 10);
      return CalendarDate._fromMoment(m.year(startYear).startOf("year"));
    }
    const m = localMoment(this.#anchor, ANCHOR_FORMAT, true).startOf(unit);
    return CalendarDate._fromMoment(m);
  }

  endOf(unit: "year" | "quarter" | "month" | "week" | "day" | "decade" | "hour"): CalendarDate {
    // CalendarDate has day-level precision; hour boundaries are accepted for Shiftable parity but are no-ops.
    if (unit === "hour") return this;
    if (unit === "decade") {
      const m = localMoment(this.#anchor, ANCHOR_FORMAT, true);
      const endYear = m.year() + (9 - (m.year() % 10));
      return CalendarDate._fromMoment(m.year(endYear).endOf("year"));
    }
    const m = localMoment(this.#anchor, ANCHOR_FORMAT, true).endOf(unit);
    return CalendarDate._fromMoment(m);
  }
}
