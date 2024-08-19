import type { JournalSettings, PluginSettings } from "./types/settings.types";

export const defaultPluginSettings: PluginSettings = {
  version: 2,
  journals: {},
  shelves: {},
  calendar: {
    firstDayOfWeek: -1,
    firstWeekOfYear: 1,
  },
  calendarView: {
    display: "month",
    leaf: "left",
    weeks: "left",
    todayMode: "navigate",
  },
};

export const defaultJournalSettings: JournalSettings = {
  id: "",
  name: "",
  shelves: [],

  write: {
    type: "day",
  },

  openMode: "active",
  confirmCreation: false,

  nameTemplate: "",
  dateFormat: "",
  folder: "",
  templates: [],

  ribbon: {
    show: false,
    icon: "",
    tooltip: "",
  },

  start: {
    enabled: false,
    date: "",
  },

  end: {
    type: "never",
  },

  index: {
    enabled: false,
    anchorDate: "",
    anchorIndex: 1,
    type: "increment",
    resetAfter: 0,
    secondary: false,
    secondaryAncorIndex: 1,
  },

  autoCreate: false,

  commands: [],

  highlights: [],

  navBlock: {
    type: "create",
    nameTemplate: "",
    showPeriod: false,
    periodTemplate: "",
  },
};
