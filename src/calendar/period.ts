import type { CalendarDate } from "./calendar-date";

export type PeriodKind = "day" | "week" | "month" | "quarter" | "year" | "decade";

export interface PeriodBase<Self> {
  readonly kind: PeriodKind;
  readonly start: CalendarDate;
  readonly end: CalendarDate;
  readonly anchor: CalendarDate;

  next(): Self;
  previous(): Self;
  contains(d: CalendarDate): boolean;
  isSame(other: Self): boolean;
  days(): Iterable<CalendarDate>;
  format(pattern: string): string;
}
