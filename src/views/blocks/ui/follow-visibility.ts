import { CalendarDate, periodOfKind, window as periodWindow } from "@/calendar";
import type { AnchorString, MonthPeriod, WeekPeriod } from "@/calendar";

export function spanContains(anchor: AnchorString, start: AnchorString, end: AnchorString): boolean {
  const date = CalendarDate.fromAnchor(anchor);
  return !date.isBefore(CalendarDate.fromAnchor(start)) && !date.isAfter(CalendarDate.fromAnchor(end));
}

export function monthWindowContains(anchor: AnchorString, focus: AnchorString, before: number, after: number): boolean {
  const focusMonth = periodOfKind("month", CalendarDate.fromAnchor(focus)) as MonthPeriod;
  const months = periodWindow(focusMonth, before, after);
  // Spillover days painted in the grid's margins belong to a neighboring month this window
  // does not display, so they are not "already shown" for the purpose of holding a layout.
  return spanContains(
    anchor,
    (months.at(0) ?? focusMonth).start.toAnchor(),
    (months.at(-1) ?? focusMonth).end.toAnchor(),
  );
}

export function weekWindowContains(anchor: AnchorString, focus: AnchorString, before: number, after: number): boolean {
  const focusWeek = periodOfKind("week", CalendarDate.fromAnchor(focus)) as WeekPeriod;
  const weeks = periodWindow(focusWeek, before, after);
  return spanContains(anchor, (weeks.at(0) ?? focusWeek).start.toAnchor(), (weeks.at(-1) ?? focusWeek).end.toAnchor());
}
