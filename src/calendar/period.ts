import type { CalendarDate } from "./calendar-date";
import type { DayPeriod } from "./period-day";
import type { DecadePeriod } from "./period-decade";
import type { MonthPeriod } from "./period-month";
import type { QuarterPeriod } from "./period-quarter";
import type { WeekPeriod } from "./period-week";
import type { YearPeriod } from "./period-year";

export const periodKinds = ["day", "week", "month", "quarter", "year", "decade"] as const;
export type PeriodKind = (typeof periodKinds)[number];

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

export type Period = DayPeriod | WeekPeriod | MonthPeriod | QuarterPeriod | YearPeriod | DecadePeriod;
