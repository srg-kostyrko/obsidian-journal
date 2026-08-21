import type { CalendarDate } from "./calendar-date";

/** Which week of its own month a date's week is, counting the week that holds the 1st as week 1. */
export function weekOfMonth(date: CalendarDate): number {
  const weekStart = date.startOf("week");
  let cursor = date.startOf("month").startOf("week");
  let week = 1;
  while (cursor.isBefore(weekStart)) {
    cursor = cursor.shift(1, "w");
    week++;
  }
  return week;
}
