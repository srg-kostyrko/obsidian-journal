import { CalendarConfig, CalendarGranularity, IntervalConfig, PluginSettings } from "../contracts/config.types";

export const DEFAULT_NAME_TEMPLATE_CALENDAR = "{{date}}";
export const DEFAULT_NAME_TEMPLATE_INTERVAL = "{{journal_name}} {{index}}";

export const DEFAULT_DATE_FORMAT = "YYYY-MM-DD";
export const DEFAULT_DATE_FORMATS_CALENDAR: Record<CalendarGranularity, string> = {
  day: "YYYY-MM-DD",
  week: "YYYY-[W]ww",
  month: "YYYY-MM",
  quarter: "YYYY-[Q]Q",
  year: "YYYY",
};

export const DEFAULT_RIBBON_ICONS_CALENDAR = "calendar-days";
export const DEFAULT_RIBBON_ICONS_INTERVAL = "calendar-range";

export const DEFAULT_RIBBON_TOOLTIPS: Record<CalendarGranularity, string> = {
  day: "Open today's note",
  week: "Open this week's note",
  month: "Open this month's note",
  quarter: "Open this quarter's note",
  year: "Open this year's note",
};

export const DEFAULT_CONFIG_CALENDAR: CalendarConfig = {
  id: "",
  type: "calendar",
  name: "",
  rootFolder: "",
  openOnStartup: false,
  startupSection: "day",

  day: {
    enabled: false,
    openMode: "active",
    nameTemplate: "",
    dateFormat: "",
    folder: "",
    template: "",
    ribbon: {
      show: false,
      icon: "",
      tooltip: "",
    },
    createOnStartup: false,
  },
  week: {
    enabled: false,
    openMode: "active",
    nameTemplate: "",
    dateFormat: "",
    folder: "",
    template: "",
    ribbon: {
      show: false,
      icon: "",
      tooltip: "",
    },
    createOnStartup: false,
  },
  month: {
    enabled: false,
    openMode: "active",
    nameTemplate: "",
    dateFormat: "",
    folder: "",
    template: "",
    ribbon: {
      show: false,
      icon: "",
      tooltip: "",
    },
    createOnStartup: false,
  },
  quarter: {
    enabled: false,
    openMode: "active",
    nameTemplate: "",
    dateFormat: "",
    folder: "",
    template: "",
    ribbon: {
      show: false,
      icon: "",
      tooltip: "",
    },
    createOnStartup: false,
  },
  year: {
    enabled: false,
    openMode: "active",
    nameTemplate: "",
    dateFormat: "",
    folder: "",
    template: "",
    ribbon: {
      show: false,
      icon: "",
      tooltip: "",
    },
    createOnStartup: false,
  },
};

export const DEFAULT_CONFIG_INTERVAL: IntervalConfig = {
  id: "",
  type: "interval",
  name: "",
  duration: 1,
  granularity: "day",
  start_date: "",
  start_index: 1,
  numeration_type: "increment",
  openOnStartup: false,
  openMode: "active",
  nameTemplate: "",
  dateFormat: "",
  folder: "",
  template: "",
  ribbon: {
    show: false,
    icon: "",
    tooltip: "",
  },
  createOnStartup: false,
};

export const DEFAULT_PLUGIN_SETTINGS: PluginSettings = {
  journals: {},
  calendar: {
    firstDayOfWeek: -1,
    firstWeekOfYear: 1,
  },
};
