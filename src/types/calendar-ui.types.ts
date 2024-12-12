export interface CalendarUiDay {
  date: string;
  key: string;
  outside: boolean;
  today?: boolean;
  isWeekNumber?: boolean;
}

export interface CalendarUiElement {
  date: string;
  key: string;
  outside?: boolean;
}
