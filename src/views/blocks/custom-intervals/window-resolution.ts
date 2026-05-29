import { match } from "ts-pattern";

import { CalendarDate, MonthPeriod, QuarterPeriod, WeekPeriod, YearPeriod } from "@/calendar";
import type { AnchorString } from "@/calendar/types";

export type WindowKind = "current-week" | "current-month" | "current-quarter" | "current-year";

export interface ResolvedWindow {
  readonly start: AnchorString;
  readonly end: AnchorString;
}

export function resolveWindow(window: WindowKind, refDate: AnchorString): ResolvedWindow {
  const date = CalendarDate.fromAnchor(refDate);
  const period = match(window)
    .with("current-week", () => WeekPeriod.containing(date))
    .with("current-month", () => MonthPeriod.containing(date))
    .with("current-quarter", () => QuarterPeriod.containing(date))
    .with("current-year", () => YearPeriod.containing(date))
    .exhaustive();
  return { start: period.start.toAnchor(), end: period.end.toAnchor() };
}
