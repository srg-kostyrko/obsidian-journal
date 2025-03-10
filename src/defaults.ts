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
  PluginCommand,
} from "./types/settings.types";

export const CURRENT_DATA_VERSION = 3;

export const defaultPluginSettings: PluginSettings = {
  version: CURRENT_DATA_VERSION,
  ui: {
    calendarShelf: null,
  },
  pendingMigrations: [],
  dismissedNotifications: [],
  useShelves: false,
  showReloadHint: false,
  openOnStartup: "",
  journals: {},
  shelves: {},
  commands: [
    {
      name: "Open today's note",
      writeType: "day",
      type: "same",
      openMode: "tab",
      showInRibbon: false,
      icon: "",
    },
    {
      name: "Open weekly note",
      writeType: "week",
      type: "same",
      openMode: "tab",
      showInRibbon: false,
      icon: "",
    },
    {
      name: "Open monthly note",
      writeType: "month",
      type: "same",
      openMode: "tab",
      showInRibbon: false,
      icon: "",
    },
    {
      name: "Open quarterly note",
      writeType: "quarter",
      type: "same",
      openMode: "tab",
      showInRibbon: false,
      icon: "",
    },
    {
      name: "Open yearly note",
      writeType: "year",
      type: "same",
      openMode: "tab",
      showInRibbon: false,
      icon: "",
    },
    {
      name: "Open tomorrow's note",
      writeType: "day",
      type: "next",
      openMode: "tab",
      showInRibbon: false,
      icon: "",
    },
    {
      name: "Open next week note",
      writeType: "week",
      type: "next",
      openMode: "tab",
      showInRibbon: false,
      icon: "",
    },
    {
      name: "Open next month note",
      writeType: "month",
      type: "next",
      openMode: "tab",
      showInRibbon: false,
      icon: "",
    },
    {
      name: "Open next quarter note",
      writeType: "quarter",
      type: "next",
      openMode: "tab",
      showInRibbon: false,
      icon: "",
    },
    {
      name: "Open next year note",
      writeType: "year",
      type: "next",
      openMode: "tab",
      showInRibbon: false,
      icon: "",
    },
    {
      name: "Open yesterday's note",
      writeType: "day",
      type: "previous",
      openMode: "tab",
      showInRibbon: false,
      icon: "",
    },
    {
      name: "Open last week note",
      writeType: "week",
      type: "previous",
      openMode: "tab",
      showInRibbon: false,
      icon: "",
    },
    {
      name: "Open last month note",
      writeType: "month",
      type: "previous",
      openMode: "tab",
      showInRibbon: false,
      icon: "",
    },
    {
      name: "Open last quarter note",
      writeType: "quarter",
      type: "previous",
      openMode: "tab",
      showInRibbon: false,
      icon: "",
    },
    {
      name: "Open last year note",
      writeType: "year",
      type: "previous",
      openMode: "tab",
      showInRibbon: false,
      icon: "",
    },
  ],
  calendar: {
    dow: -1,
    doy: 1,
    global: false,
  },
  calendarView: {
    display: "month",
    leaf: "right",
    weeks: "left",
    todayMode: "navigate",
    pickMode: "create",
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
  },

  autoCreate: false,

  commands: [],

  decorations: [
    {
      mode: "and",
      conditions: [{ type: "has-note" }],
      styles: [
        {
          type: "shape",
          size: 0.4,
          shape: "circle",
          color: { type: "theme", name: "interactive-accent" },
          placement_x: "center",
          placement_y: "bottom",
        },
      ],
    },
  ],

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

export const defaultPluginCommand: PluginCommand = {
  icon: "",
  name: "",
  writeType: "day",
  type: "same",
  showInRibbon: false,
  openMode: "active",
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
    size: 0.4,
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
    size: 0.5,
    color: { type: "transparent" },
    placement_x: "center",
    placement_y: "top",
  },
};
