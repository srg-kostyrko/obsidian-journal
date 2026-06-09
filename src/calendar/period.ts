import { DayPeriod } from "./period-day";
import { DecadePeriod } from "./period-decade";
import { MonthPeriod } from "./period-month";
import { QuarterPeriod } from "./period-quarter";
import { WeekPeriod } from "./period-week";
import { YearPeriod } from "./period-year";

import type { CalendarDate } from "./calendar-date";

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

const PERIOD_OF_KIND: Record<PeriodKind, (date: CalendarDate) => Period> = {
  day: (d) => DayPeriod.containing(d),
  week: (d) => WeekPeriod.containing(d),
  month: (d) => MonthPeriod.containing(d),
  quarter: (d) => QuarterPeriod.containing(d),
  year: (d) => YearPeriod.containing(d),
  decade: (d) => DecadePeriod.containing(d),
};

export function periodOfKind(kind: PeriodKind, date: CalendarDate): Period {
  return PERIOD_OF_KIND[kind](date);
}
