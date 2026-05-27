import { match } from "ts-pattern";

import {
  CalendarDate,
  DayPeriod,
  MonthPeriod,
  QuarterPeriod,
  WeekPeriod,
  YearPeriod,
  type AnchorString,
  type Period,
} from "@/calendar";
import type { JournalWrite } from "@/journals";

export function periodForJournal(write: JournalWrite, anchor: AnchorString): Period {
  const date = CalendarDate.fromAnchor(anchor);
  return match(write)
    .with({ type: "day" }, () => DayPeriod.containing(date))
    .with({ type: "week" }, () => WeekPeriod.containing(date))
    .with({ type: "month" }, () => MonthPeriod.containing(date))
    .with({ type: "quarter" }, () => QuarterPeriod.containing(date))
    .with({ type: "year" }, () => YearPeriod.containing(date))
    .with({ type: "custom" }, () => DayPeriod.containing(date))
    .exhaustive();
}
