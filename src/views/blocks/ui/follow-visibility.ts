import { CalendarDate, periodOfKind, window as periodWindow } from "@/calendar";
import type { AnchorString, MonthPeriod, WeekPeriod } from "@/calendar";

export function spanContains(anchor: AnchorString, start: AnchorString, end: AnchorString): boolean {
  const date = CalendarDate.fromAnchor(anchor);
  return !date.isBefore(CalendarDate.fromAnchor(start)) && !date.isAfter(CalendarDate.fromAnchor(end));
}

export function monthWindowContains(anchor: AnchorString, focus: AnchorString, before: number, after: number): boolean {
  const focusMonth = periodOfKind("month", CalendarDate.fromAnchor(focus)) as MonthPeriod;
  const months = periodWindow(focusMonth, before, after);
  // Expand to full weeks so the check matches the grid's spillover days, mirroring v2.
  const gridStart = periodOfKind("week", (months.at(0) ?? focusMonth).start).start;
  const gridEnd = periodOfKind("week", (months.at(-1) ?? focusMonth).end).end;
  return spanContains(anchor, gridStart.toAnchor(), gridEnd.toAnchor());
}

export function weekWindowContains(anchor: AnchorString, focus: AnchorString, before: number, after: number): boolean {
  const focusWeek = periodOfKind("week", CalendarDate.fromAnchor(focus)) as WeekPeriod;
  const weeks = periodWindow(focusWeek, before, after);
  return spanContains(anchor, (weeks.at(0) ?? focusWeek).start.toAnchor(), (weeks.at(-1) ?? focusWeek).end.toAnchor());
}
