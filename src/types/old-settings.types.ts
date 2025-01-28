import type { OpenMode } from "./settings.types";

type CalendarGranularity = "day" | "week" | "month" | "quarter" | "year";

export interface PluginSettingsV1 {
  journals: Record<string, JournalConfigV1>;
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
  end_type: "never" | "date" | "repeats";
  end_date: string;
  repeats: number;

  limitCreation: boolean;
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

  calendar_view: {
    order: "chrono" | "reverse";
  };
}

export type JournalConfigV1 = CalendarConfig | IntervalConfig;
