export type CalendarGranularity = "day" | "week" | "month" | "quarter" | "year";
export type SectionName = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

interface JournalCaseConfig {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface CalendarConfig extends JournalCaseConfig {
  type: "calendar";

  rootFolder: string;
  openOnStartup: boolean;
  startupSection: SectionName;

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

export interface IntervalConfig extends JournalCaseConfig {
  type: "interval";
}

export type JournalConfigs = CalendarConfig | IntervalConfig;
