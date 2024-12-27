import type {
  JournalSettings,
  PluginSettings,
  JournalCommand,
  JournalDecorationsStyle,
  JournalDecorationCondition,
} from "./types/settings.types";

export const defaultPluginSettings: PluginSettings = {
  version: 2,
  ui: {
    calendarShelf: null,
  },
  useShelves: false,
  showReloadHint: false,
  journals: {},
  shelves: {},
  calendar: {
    firstDayOfWeek: -1,
    firstWeekOfYear: 1,
  },
  calendarView: {
    display: "month",
    leaf: "right",
    weeks: "left",
    todayMode: "navigate",
  },
};

export const defaultJournalSettings: JournalSettings = {
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

  decorations: [],

  navBlock: {
    type: "create",
    rows: [],
  },
  calendarViewBlock: {
    rows: [],
  },
};

export const defaultCommand: JournalCommand = {
  icon: "",
  name: "",
  type: "same",
  context: "today",
  showInRibbon: false,
};

export const defaultConditions: Record<JournalDecorationCondition["type"], JournalDecorationCondition> = {
  date: {
    type: "date",
    day: -1,
    month: -1,
    year: null,
  },
  title: {
    type: "title",
    condition: "contains",
    value: "",
  },
  tag: {
    type: "tag",
    condition: "contains",
    value: "",
  },
  property: {
    type: "property",
    name: "",
    condition: "contains",
    value: "",
  },
  weekday: {
    type: "weekday",
    weekdays: [],
  },
  offset: {
    type: "offset",
    offset: 0,
  },
  "has-note": {
    type: "has-note",
  },
  "has-open-task": {
    type: "has-open-task",
  },
  "all-tasks-completed": {
    type: "all-tasks-completed",
  },
};

export const defaultDecorations: Record<JournalDecorationsStyle["type"], JournalDecorationsStyle> = {
  background: {
    type: "background",
    color: { type: "transparent" },
  },
  color: {
    type: "color",
    color: { type: "theme", name: "text-normal" },
  },
  border: {
    type: "border",
    border: "uniform",
    left: {
      show: true,
      width: 1,
      color: { type: "transparent" },
      style: "solid",
    },
    right: {
      show: false,
      width: 1,
      color: { type: "transparent" },
      style: "solid",
    },
    top: {
      show: false,
      width: 1,
      color: { type: "transparent" },
      style: "solid",
    },
    bottom: {
      show: false,
      width: 1,
      color: { type: "transparent" },
      style: "solid",
    },
  },
  shape: {
    type: "shape",
    shape: "circle",
    color: { type: "transparent" },
    placement_x: "center",
    placement_y: "bottom",
  },
  corner: {
    type: "corner",
    placement: "top-left",
    color: { type: "transparent" },
  },
  icon: {
    type: "icon",
    icon: "",
    color: { type: "transparent" },
    placement_x: "center",
    placement_y: "top",
  },
};
