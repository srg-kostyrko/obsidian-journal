import type { PeriodKind } from "@/calendar";

export type View = "month" | "week" | "quarter" | "year" | "decade";
export type Picking = "day" | "week" | "month" | "quarter" | "year";

export class DatePickerInvariantError extends Error {
  readonly currentView: View;
  readonly picking: Picking;
  readonly cellKind: PeriodKind;

  constructor(view: View, picking: Picking, cellKind: PeriodKind) {
    super(`unreachable descent: view=${view} picking=${picking} cell=${cellKind}`);
    this.name = "DatePickerInvariantError";
    this.currentView = view;
    this.picking = picking;
    this.cellKind = cellKind;
  }
}
