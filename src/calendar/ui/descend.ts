import { match } from "ts-pattern";

import type { CalendarDate, Period } from "@/calendar";

import { DatePickerInvariantError, type Picking, type View } from "./errors";

export function descend(view: View, picking: Picking, cell: Period): { nextView: View; nextRef: CalendarDate } {
  const ref = cell.anchor;
  return match([view, picking] as [View, Picking])
    .with(["decade", "month"], (): { nextView: View; nextRef: CalendarDate } => ({ nextView: "year", nextRef: ref }))
    .with(["decade", "quarter"], (): { nextView: View; nextRef: CalendarDate } => ({
      nextView: "quarter",
      nextRef: ref,
    }))
    .with(["decade", "day"], (): { nextView: View; nextRef: CalendarDate } => ({ nextView: "year", nextRef: ref }))
    .with(["decade", "week"], (): { nextView: View; nextRef: CalendarDate } => ({ nextView: "year", nextRef: ref }))
    .with(["year", "day"], (): { nextView: View; nextRef: CalendarDate } => ({ nextView: "month", nextRef: ref }))
    .with(["year", "week"], (): { nextView: View; nextRef: CalendarDate } => ({ nextView: "week", nextRef: ref }))
    .otherwise(() => {
      throw new DatePickerInvariantError(view, picking, cell.kind);
    });
}
