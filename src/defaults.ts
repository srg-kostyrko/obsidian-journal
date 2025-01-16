import {
  FRONTMATTER_DATE_KEY,
  FRONTMATTER_INDEX_KEY,
  FRONTMATTER_START_DATE_KEY,
  FRONTMATTER_END_DATE_KEY,
} from "./constants";
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
  openOnStartup: "",
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
    pickMode: "navigate",
    todayStyle: {
      color: { type: "theme", name: "text-accent" },
      background: { type: "transparent" },
    },
    activeStyle: {
      color: { type: "theme", name: "text-on-accent" },
      background: { type: "theme", name: "interactive-accent" },
    },
  },
};

export const defaultJournalSettings: JournalSettings = {
  name: "",
  shelves: [],

  write: {
    type: "day",
  },

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
    decorateWholeBlock: false,
  },
  calendarViewBlock: {
    rows: [],
    decorateWholeBlock: false,
  },

  frontmatter: {
    dateField: "",
    addStartDate: false,
    startDateField: "",
    addEndDate: false,
    endDateField: "",
    indexField: "",
  },
};

export const defaultFieldNames: Record<string, string> = {
  dateField: FRONTMATTER_DATE_KEY,
  indexField: FRONTMATTER_INDEX_KEY,
  startDateField: FRONTMATTER_START_DATE_KEY,
  endDateField: FRONTMATTER_END_DATE_KEY,
};

export const defaultCommand: JournalCommand = {
  icon: "",
  name: "",
  type: "same",
  context: "today",
  showInRibbon: false,
  openMode: "active",
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
