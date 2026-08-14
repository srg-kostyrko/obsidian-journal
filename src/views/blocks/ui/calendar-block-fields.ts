export interface CalendarBlockFields {
  before: number;
  after: number;
  hiddenWeekdays: number[];
  weeks: "default" | "none" | "left" | "right";
}

export type CalendarBlockFieldsChange = (patch: Partial<CalendarBlockFields>) => void;
