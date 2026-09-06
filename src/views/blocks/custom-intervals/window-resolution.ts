import { CalendarDate, periodOfKind } from "@/calendar";
import type { AnchorString } from "@/calendar/types";

export const windowKinds = ["day", "week", "month", "quarter", "year"] as const;
export type WindowKind = (typeof windowKinds)[number];

export interface ResolvedWindow {
  readonly start: AnchorString;
  readonly end: AnchorString;
}

export function resolveWindow(window: WindowKind, refDate: AnchorString): ResolvedWindow {
  const period = periodOfKind(window, CalendarDate.fromAnchor(refDate));
  return { start: period.start.toAnchor(), end: period.end.toAnchor() };
}
