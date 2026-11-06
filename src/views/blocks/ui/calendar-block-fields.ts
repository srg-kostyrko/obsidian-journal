export interface CalendarBlockFields {
  before: number;
  after: number;
  hiddenWeekdays: number[];
  weeks: "default" | "none" | "left" | "right";
  showHeading: boolean | "default";
  showWeekdays: boolean | "default";
}

export type CalendarBlockFieldsChange = (patch: Partial<CalendarBlockFields>) => void;
