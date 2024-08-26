import type { JournalSettings, PluginSettings, JournalCommand } from "./types/settings.types";

export const defaultPluginSettings: PluginSettings = {
  version: 2,
  showReloadHint: false,
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

  start: "",

  end: {
    type: "never",
  },

  index: {
    enabled: false,
    anchorDate: "",
    anchorIndex: 1,
    allowBefore: false,
    type: "increment",
    resetAfter: 2,
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

export const defaultCommand: JournalCommand = {
  icon: "",
  name: "",
  type: "same",
  context: "today",
  showInRibbon: false,
};
