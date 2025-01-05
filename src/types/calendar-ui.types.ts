export interface CalendarUiDay {
  date: string;
  key: string;
  outside: boolean;
  disabled: boolean;
  today?: boolean;
  isWeekNumber?: boolean;
}

export interface CalendarUiElement {
  date: string;
  key: string;
  outside?: boolean;
  disabled: boolean;
}
