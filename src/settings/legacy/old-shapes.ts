export type OpenMode = "active" | "tab" | "split" | "window";

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

export interface OldPluginSettings {
  version: number;

  ui: {
    calendarShelf: string | null;
  };
  pendingMigrations: unknown[];
  dismissedNotifications: string[];

  useShelves: boolean;
  showReloadHint: boolean;
  openOnStartup: string;

  journals: Record<string, OldJournalSettings>;
  shelves: Record<string, OldShelfSettings>;

  commands: OldPluginCommand[];

  calendar: {
    dow: number;
    doy: number;
    global: boolean;
  };

  calendarView: {
    display: "month" | "week" | "day";

    leaf: "left" | "right";
    weeks: "none" | "left" | "right";

    todayMode: "navigate" | "create" | "switch_date";
    pickMode: "navigate" | "create" | "switch_date";

    todayStyle: {
      color: ColorSettings;
      background: ColorSettings;
    };
    activeStyle: {
      color: ColorSettings;
      background: ColorSettings;
    };
  };

  pendingNoteMigration?: unknown[];
}

export interface OldShelfSettings {
  name: string;
  journals: string[];
  commands: OldPluginCommand[];
}

export interface WriteDaily {
  type: "day";
}

export interface WriteWeekly {
  type: "week";
}

export interface WriteMonthly {
  type: "month";
}

export interface WriteQuarterly {
  type: "quarter";
}

export interface WriteYearly {
  type: "year";
}

export interface WriteWeekdays {
  type: "weekdays";
  weekdays: number[];
}

export interface WriteCustom {
  type: "custom";
  every: "day" | "week" | "month" | "quarter" | "year";
  duration: number;
  anchorDate: string;
}

export interface EndWritingNever {
  type: "never";
}

export interface EndWritingDate {
  type: "date";
  date: string;
}

export interface EndWritingAfterNTimes {
  type: "repeats";
  repeats: number;
}

export type FixedWriteIntervals = WriteDaily | WriteWeekly | WriteMonthly | WriteQuarterly | WriteYearly;

export interface OldJournalSettings {
  name: string;
  shelves: string[];

  write: FixedWriteIntervals | WriteCustom;

  confirmCreation: boolean;
  autoCreate: boolean;

  nameTemplate: string;
  dateFormat: string;
  folder: string;
  templates: string[];

  start: string;

  end: EndWritingNever | EndWritingDate | EndWritingAfterNTimes;

  index: {
    enabled: boolean;
    anchorDate: string;
    anchorIndex: number;
    allowBefore: boolean;
    type: "increment" | "reset_after";
    resetAfter: number;
  };

  commands: OldJournalCommand[];

  decorations: JournalDecoration[];

  navBlock: {
    type: "create" | "existing";
    rows: OldNavBlockRow[];
    decorateWholeBlock: boolean;
  };
  calendarViewBlock: {
    rows: OldNavBlockRow[];
    decorateWholeBlock: boolean;
  };

  frontmatter: {
    dateField: string;
    addStartDate: boolean;
    startDateField: string;
    addEndDate: boolean;
    endDateField: string;
    indexField: string;
  };
}

export interface OldPluginCommand {
  icon: string;
  name: string;
  writeType: FixedWriteIntervals["type"];
  type: "same" | "next" | "previous";
  showInRibbon: boolean;
  openMode: OpenMode;
}

export interface OldJournalCommand {
  icon: string;
  name: string;
  type:
    | "same"
    | "next"
    | "previous"
    | "same_next_week"
    | "same_previous_week"
    | "same_next_month"
    | "same_previous_month"
    | "same_next_year"
    | "same_previous_year";
  context: "today" | "open_note" | "only_open_note";
  showInRibbon: boolean;
  openMode: OpenMode;
}

export interface JournalDecoration {
  mode: "or" | "and";
  conditions: JournalDecorationCondition[];
  styles: JournalDecorationsStyle[];
}

export interface BorderSettings {
  show: boolean;
  width: number;
  color: ColorSettings;
  style: string;
}

export interface JournalDecorationBackground {
  type: "background";
  color: ColorSettings;
}

export interface JournalDecorationColor {
  type: "color";
  color: ColorSettings;
}

export interface JournalDecorationBorder {
  type: "border";
  border: "uniform" | "different";
  left: BorderSettings;
  right: BorderSettings;
  top: BorderSettings;
  bottom: BorderSettings;
}

export interface JournalDecorationShape {
  type: "shape";
  size: number;
  shape: "square" | "circle" | "triangle-up" | "triangle-down" | "triangle-left" | "triangle-right";
  color: ColorSettings;
  placement_x: "left" | "center" | "right";
  placement_y: "top" | "middle" | "bottom";
}

export interface JournalDecorationCorner {
  type: "corner";
  placement: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  color: ColorSettings;
}
export interface JournalDecorationIcon {
  type: "icon";
  icon: string;
  placement_x: "left" | "center" | "right";
  placement_y: "top" | "middle" | "bottom";
  color: ColorSettings;
  size: number;
}

export type JournalDecorationsStyle =
  | JournalDecorationBackground
  | JournalDecorationColor
  | JournalDecorationBorder
  | JournalDecorationShape
  | JournalDecorationCorner
  | JournalDecorationIcon;

export interface JournalDecorationTitleCondition {
  type: "title";
  condition: "contains" | "starts-with" | "ends-with";
  value: string;
}

export interface JournalDecorationTagCondition {
  type: "tag";
  condition: "contains" | "starts-with" | "ends-with";
  value: string;
}

export interface JournalDecorationPropertyCondition {
  type: "property";
  name: string;
  condition: "exists" | "does-not-exist" | "eq" | "neq" | "contains" | "does-not-contain" | "starts-with" | "ends-with";
  value: string;
}

export interface JournalDecorationDateCondition {
  type: "date";
  day: number;
  month: number;
  year: number | null;
}

export interface JournalDecorationWeekdayCondition {
  type: "weekday";
  weekdays: number[];
}

export interface JournalDecorationOffsetCondition {
  type: "offset";
  offset: number;
}

export interface JournalDecorationHasNoteCondition {
  type: "has-note";
}

export interface JournalDecorationHasOpenTaskCondition {
  type: "has-open-task";
}

export interface JournalDecorationAllTasksCompletedCondition {
  type: "all-tasks-completed";
}

export type GenericConditions =
  | JournalDecorationTitleCondition
  | JournalDecorationTagCondition
  | JournalDecorationPropertyCondition;

export type JournalDecorationCondition =
  | JournalDecorationTitleCondition
  | JournalDecorationTagCondition
  | JournalDecorationPropertyCondition
  | JournalDecorationDateCondition
  | JournalDecorationWeekdayCondition
  | JournalDecorationOffsetCondition
  | JournalDecorationHasNoteCondition
  | JournalDecorationHasOpenTaskCondition
  | JournalDecorationAllTasksCompletedCondition;

export type NotesProcessing = "keep" | "clear" | "delete";

export interface OldNavBlockRow {
  template: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  color: ColorSettings;
  background: ColorSettings;
  link: "none" | "self" | "journal" | Exclude<OldJournalSettings["write"]["type"], "custom">;
  journal: string;
  addDecorations: boolean;
}

export type ColorSettings =
  | {
      type: "transparent";
    }
  | {
      type: "theme";
      name: string;
    }
  | {
      type: "custom";
      color: string;
    };

export function calculateDoy(firstDayOfWeek: number, firstWeekOfYear: number): number {
  return 7 + firstDayOfWeek - firstWeekOfYear;
}

export const emptyNavRow: OldNavBlockRow = {
  template: "",
  fontSize: 1,
  bold: false,
  italic: false,
  link: "none",
  journal: "",
  color: { type: "theme", name: "text-normal" },
  background: { type: "transparent" },
  addDecorations: false,
};

export const defaultDateFormats: Record<OldJournalSettings["write"]["type"], string> = {
  day: "YYYY-MM-DD",
  week: "YYYY-[W]w",
  month: "YYYY-MM",
  quarter: "YYYY-[Q]Q",
  year: "YYYY",
  custom: "YYYY-MM-DD",
};

const defaultNameTemplates: Record<OldJournalSettings["write"]["type"], string> = {
  day: "{{date}}",
  week: "{{date}}",
  month: "{{date}}",
  quarter: "{{date}}",
  year: "{{date}}",
  custom: "{{journal_name}} {{index}}",
};

export const defaultCommands: OldPluginCommand[] = [
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
];

export const defaultOldJournalSettings: OldJournalSettings = {
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

const rowNavWeek: OldNavBlockRow = {
  ...emptyNavRow,
  template: "{{date:[W]w}}",
  link: "week",
};
const rowNavMonth: OldNavBlockRow = {
  ...emptyNavRow,
  template: "{{date:MMMM}}",
  link: "month",
};
const rowNavYear: OldNavBlockRow = {
  ...emptyNavRow,
  template: "{{date:YYYY}}",
  link: "year",
};
const rowNavRelative: OldNavBlockRow = {
  ...emptyNavRow,
  template: "{{relative_date}}",
  fontSize: 0.7,
};

const defaultNavBlocks: Record<OldJournalSettings["write"]["type"], OldJournalSettings["navBlock"]> = {
  day: {
    type: "create",
    decorateWholeBlock: false,
    rows: [
      {
        ...emptyNavRow,
        template: "{{date:ddd}}",
      },
      {
        ...emptyNavRow,
        template: "{{date:D}}",
        fontSize: 3,
        bold: true,
        link: "self",
        addDecorations: true,
      },
      rowNavRelative,
      rowNavWeek,
      rowNavMonth,
      rowNavYear,
    ],
  },
  week: {
    type: "create",
    decorateWholeBlock: false,
    rows: [
      {
        ...rowNavWeek,
        fontSize: 3,
        bold: true,
        link: "self",
        addDecorations: true,
      },
      rowNavRelative,
      rowNavMonth,
      rowNavYear,
    ],
  },
  month: {
    type: "create",
    decorateWholeBlock: false,
    rows: [
      {
        ...rowNavMonth,
        fontSize: 3,
        bold: true,
        link: "self",
        addDecorations: true,
      },
      rowNavRelative,
      rowNavYear,
    ],
  },
  quarter: {
    type: "create",
    decorateWholeBlock: false,
    rows: [
      {
        ...emptyNavRow,
        template: "{{date:[Q]Q}}",
        fontSize: 3,
        bold: true,
        link: "self",
        addDecorations: true,
      },
      rowNavRelative,
      rowNavYear,
    ],
  },
  year: {
    type: "create",
    decorateWholeBlock: false,
    rows: [
      {
        ...rowNavYear,
        fontSize: 3,
        bold: true,
        link: "self",
        addDecorations: true,
      },
      rowNavRelative,
    ],
  },
  custom: {
    type: "create",
    decorateWholeBlock: false,
    rows: [
      {
        ...emptyNavRow,
        template: "{{journal_name}} {{index}}",
        link: "self",
        fontSize: 3,
        bold: true,
        addDecorations: true,
      },
      {
        ...emptyNavRow,
        template: "{{start_date}}",
      },
      {
        ...emptyNavRow,
        template: "to",
      },
      {
        ...emptyNavRow,
        template: "{{end_date}}",
      },
    ],
  },
};

export function oldJournalDefaultsBasedOnType(write: OldJournalSettings["write"]): Partial<OldJournalSettings> {
  const defaults: Partial<OldJournalSettings> = {
    nameTemplate: defaultNameTemplates[write.type],
    dateFormat: defaultDateFormats[write.type],
    navBlock: defaultNavBlocks[write.type],
  };
  if (write.type === "custom") {
    defaults.start = write.anchorDate;
    defaults.index = {
      enabled: true,
      anchorDate: write.anchorDate,
      anchorIndex: 1,
      allowBefore: false,
      type: "increment",
      resetAfter: 1,
    };
    defaults.calendarViewBlock = {
      decorateWholeBlock: true,
      rows: [
        {
          ...emptyNavRow,
          template: "{{journal_name}} {{index}}",
          link: "self",
          fontSize: 1.2,
          bold: true,
        },
        {
          ...emptyNavRow,
          template: "{{start_date}} to {{end_date}}",
        },
      ],
    };
    defaults.decorations = [
      {
        mode: "and",
        conditions: [{ type: "has-note" }],
        styles: [
          {
            type: "border",
            border: "different",
            left: {
              show: true,
              width: 2,
              color: { type: "theme", name: "interactive-accent" },
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
        ],
      },
    ];
  }

  return defaults;
}
