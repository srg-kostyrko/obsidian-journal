export type OpenMode = "active" | "tab" | "split" | "window";

export interface PluginSettings {
  version: number;

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

    todayMode: "navigate" | "create";
  };
}

export interface ShelfSettings {
  id: string;
  name: string;
}

interface WriteDaily {
  type: "day";
}

interface WriteWeekly {
  type: "week";
}

interface WriteMonthly {
  type: "month";
}

interface WriteQuarterly {
  type: "quarter";
}

interface WriteYearly {
  type: "year";
}

interface WriteWeekdays {
  type: "weekdays";
  weekdays: number[];
}

interface WriteCustom {
  type: "custom";
  every: "day" | "week" | "month" | "quarter" | "year";
  duration: number;
}

interface EndWritingNever {
  type: "never";
}

interface EndWritingDate {
  type: "date";
  date: string;
}

interface EndWritingAfterNTimes {
  type: "repeats";
  repeats: number;
}

export interface JournalSettings {
  id: string;
  name: string;
  shelves: string[];

  write: WriteDaily | WriteWeekly | WriteMonthly | WriteQuarterly | WriteYearly | WriteWeekdays | WriteCustom;

  openMode: OpenMode;
  confirmCreation: boolean;

  nameTemplate: string;
  dateFormat: string;
  folder: string;
  template: string[];

  ribbon: {
    show: boolean;
    icon: string;
    tooltip: string;
  };

  start: {
    enabled: boolean;
    date: string;
  };

  end: EndWritingNever | EndWritingDate | EndWritingAfterNTimes;

  index: {
    enabled: boolean;
    anchorDate: string;
    anchorIndex: number;
    type: "increment" | "year_reset" | "reset_after";
    resetAfter: number;
    secondary: boolean;
    secondaryAncorIndex: number;
  };

  autoCreate: boolean;

  commands: JournalCommand[];

  highlights: JournalHighlight[];

  navBlock: {
    type: "create" | "existing";
    nameTemplate: string;
    showPeriod: boolean;
    periodTemplate: string;
  };
}

interface JournalCommand {
  id: string;
  name: string;
  icon: string;
  offset: number; // for example days from now
}

interface JournalHighlight {
  condition: JournalHighlightCondition;
  highlights: JournalHighlightDisplay[];
}

interface BorderSettings {
  show: boolean;
  width: number;
  color: string;
  style: string;
}

type JournalHighlightDisplay =
  | {
      type: "background";
      color: string;
    }
  | {
      type: "border";
      left: BorderSettings;
      right: BorderSettings;
      top: BorderSettings;
      bottom: BorderSettings;
    }
  | {
      type: "shape";
      shape: "square" | "circle" | "triangle";
      color: string;
      placement_x: "left" | "center" | "right";
      placement_y: "top" | "middle" | "bottom";
    }
  | {
      type: "corner";
      placement: "top-left" | "top-right" | "bottom-left" | "bottom-right";
      color: string;
    }
  | {
      type: "icon";
      icon: string;
      placement_x: "left" | "center" | "right";
      placement_y: "top" | "middle" | "bottom";
      color: string;
    };

type JournalHighlightCondition =
  | {
      type: "title";
      condition: "contains" | "starts-with" | "ends-with";
      value: string;
    }
  | {
      type: "tag";
      condition: "contains" | "starts-with" | "ends-with";
      value: string;
    }
  | {
      type: "property";
      name: string;
      condition:
        | "exists"
        | "does-not-exist"
        | "eq"
        | "neq"
        | "contains"
        | "does-not-contain"
        | "starts-with"
        | "ends-with";
      value: string;
    }
  | {
      type: "date";
      day: number;
      month: number;
      year: number;
    }
  | {
      type: "weekday";
      weekdays: number[];
    }
  | {
      type: "offset";
      offset: number;
    }
  | {
      type: "has-note";
    }
  | {
      type: "has-open-task";
    }
  | {
      type: "all-tasks-completed";
    };
