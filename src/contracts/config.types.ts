export type CalendarGranularity = "day" | "week" | "month" | "quarter" | "year";
export type OpenMode = "active" | "tab" | "split" | "window";

export interface PluginSettings {
  journals: Record<string, JournalConfig>;
  calendar: {
    firstDayOfWeek: number;
    firstWeekOfYear: number;
  };
  calendar_view: {
    leaf: "left" | "right";
    weeks: "none" | "left" | "right";
  };
}

interface JournalCaseConfig {
  id: string;
  name: string;
}

export interface CalendarConfig extends JournalCaseConfig {
  type: "calendar";

  rootFolder: string;
  openOnStartup: boolean;
  startupSection: CalendarGranularity;

  day: CalendarSection;
  week: CalendarSection;
  month: CalendarSection;
  quarter: CalendarSection;
  year: CalendarSection;
}

export interface CalendarSection {
  enabled: boolean;
  openMode: OpenMode;
  nameTemplate: string;
  dateFormat: string;
  folder: string;
  template: string;
  ribbon: {
    show: boolean;
    icon: string;
    tooltip: string;
  };
  createOnStartup: boolean;
}

export interface IntervalConfig extends JournalCaseConfig {
  type: "interval";
  duration: number;
  granularity: CalendarGranularity;
  start_date: string;
  start_index: number;
  numeration_type: "increment" | "year";

  createOnStartup: boolean;
  openOnStartup: boolean;
  openMode: OpenMode;
  nameTemplate: string;
  navNameTemplate: string;
  navDatesTemplate: string;
  dateFormat: string;
  folder: string;
  template: string;
  ribbon: {
    show: boolean;
    icon: string;
    tooltip: string;
  };
}

export type JournalConfig = CalendarConfig | IntervalConfig;

export interface CalendarFrontMatter {
  type: "calendar";
  id: string;
  start_date: string;
  end_date: string;
  granularity: CalendarGranularity;
}
export interface IntervalFrontMatter {
  type: "interval";
  id: string;
  start_date: string;
  end_date: string;
  index: number;
}
export type JournalFrontMatter = CalendarFrontMatter | IntervalFrontMatter;
