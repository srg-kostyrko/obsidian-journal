export type CalendarGranularity = "day" | "week" | "month" | "quarter" | "year";

export interface CalendarConfig {
  type: "calendar";
  id: string;
  name: string;
  rootFolder: string;
  openOnStartup: boolean;
  startupSection: "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

  daily: DailyCalendarSection;
  weekly: WeeklyCalendarSection;
  monthly: MonthlyCalendarSection;
  quarterly: QuarterlyCalendarSection;
  yearly: YearlyCalendarSection;
}

export interface CalndarSectionBase {
  enabled: boolean;
  titleTemplate: string;
  dateFormat: string;
  folder: string;
  template: string;
}

export interface DailyCalendarSection extends CalndarSectionBase {}

export interface WeeklyCalendarSection extends CalndarSectionBase {
  firstDayOfWeek: "sunday" | "monday";
}
export interface MonthlyCalendarSection extends CalndarSectionBase {}
export interface QuarterlyCalendarSection extends CalndarSectionBase {}
export interface YearlyCalendarSection extends CalndarSectionBase {}

export interface IntervalConfig {
  type: "interval";
  name: string;
}

export type JournalConfigs = CalendarConfig | IntervalConfig;
