export interface CalendarBlockFields {
  before: number;
  after: number;
  hiddenWeekdays: number[];
  weeks: "none" | "left" | "right";
  followActiveDate?: boolean;
}

export type CalendarBlockFieldsChange = (patch: Partial<CalendarBlockFields>) => void;
