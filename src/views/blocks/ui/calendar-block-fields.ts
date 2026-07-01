export interface CalendarBlockFields {
  before: number;
  after: number;
  hiddenWeekdays: number[];
  weeks: "none" | "left" | "right";
}

export type CalendarBlockFieldsChange = (patch: Partial<CalendarBlockFields>) => void;
