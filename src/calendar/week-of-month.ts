import { localMoment } from "./calendar";

import type { CalendarDate } from "./calendar-date";

const ANCHOR_FORMAT = "YYYY-MM-DD";

function momentOf(date: CalendarDate): ReturnType<typeof localMoment> {
  return localMoment(date.toAnchor(), ANCHOR_FORMAT, true);
}

/** Which week of its own month a date's week is, counting the week that holds the 1st as week 1. */
export function weekOfMonth(date: CalendarDate): number {
  const weekStart = momentOf(date.startOf("week"));
  const firstWeekStart = momentOf(date.startOf("month").startOf("week"));
  return weekStart.diff(firstWeekStart, "weeks") + 1;
}
