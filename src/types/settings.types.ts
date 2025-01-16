import type { JournalAnchorDate } from "./journal.types";

export type OpenMode = "active" | "tab" | "split" | "window";

export interface PluginSettings {
  version: number;

  ui: {
    calendarShelf: string | null;
  };

  useShelves: boolean;
  showReloadHint: boolean;
  openOnStartup: string;

  journals: Record<string, JournalSettings>;
  shelves: Record<string, ShelfSettings>;

  calendar: {
    firstDayOfWeek: number;
    firstWeekOfYear: number;
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
}

export interface ShelfSettings {
  name: string;
  journals: string[];
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
  anchorDate: JournalAnchorDate;
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

export interface JournalSettings {
  name: string;
  shelves: string[];

  write: FixedWriteIntervals | WriteWeekdays | WriteCustom;

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
    secondary: boolean;
    secondaryAncorIndex: number;
  };

  commands: JournalCommand[];

  decorations: JournalDecoration[];

  navBlock: {
    type: "create" | "existing";
    rows: NavBlockRow[];
    decorateWholeBlock: boolean;
  };
  calendarViewBlock: {
    rows: NavBlockRow[];
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

export interface JournalCommand {
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

export interface NavBlockRow {
  template: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  color: ColorSettings;
  background: ColorSettings;
  link: "none" | "self" | "journal" | JournalSettings["write"]["type"];
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
