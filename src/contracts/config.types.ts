export type CalendarGranularity = "day" | "week" | "month" | "quarter" | "year";

export interface PluginSettings {
  journals: Record<string, JournalConfig>;
  defaultId: string;
  calendar: {
    firstDayOfWeek: number;
    firstWeekOfYear: number;
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
  openMode: "active" | "tab" | "split" | "window";
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

  openOnStartup: boolean;
  openMode: "active" | "tab" | "split" | "window";
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

export type JournalConfig = CalendarConfig | IntervalConfig;

export interface CalerndatFrontMatter {
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
export type JournalFrontMatter = CalerndatFrontMatter | IntervalFrontMatter;
