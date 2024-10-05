import type { MomentDate } from "./date.types";

export interface CalendarUiDay {
  date: MomentDate;
  key: string;
  outside: boolean;
  today?: boolean;
  isWeekNumber?: boolean;
}

export interface CalendarUiElement {
  date: MomentDate;
  key: string;
  outside?: boolean;
}
