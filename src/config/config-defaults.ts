import { CalendarConfig, IntervalConfig, PluginSettings } from "../contracts/config.types";

export const DEFAULT_CONFIG_CALENDAR: CalendarConfig = {
  id: "my-journal",
  type: "calendar",
  name: "My Journal",
  rootFolder: "",
  openOnStartup: false,
  startupSection: "day",

  day: {
    enabled: true,
    openMode: "active",
    nameTemplate: "{{date}}",
    dateFormat: "YYYY-MM-DD",
    folder: "",
    template: "",
    ribbon: {
      show: true,
      icon: "",
      tooltip: "",
    },
    createOnStartup: false,
  },
  week: {
    enabled: false,
    openMode: "active",
    nameTemplate: "{{date}}",
    dateFormat: "YYYY-[W]ww",
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
    nameTemplate: "{{date}}",
    dateFormat: "YYYY-MM",
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
    nameTemplate: "{{date}}",
    dateFormat: "YYYY-[Q]Q",
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
    nameTemplate: "{{date}}",
    dateFormat: "YYYY",
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
  nameTemplate: "{{index}}",
  dateFormat: "YYYY-MM-DD",
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
