import type { JournalSettings, NavBlockRow } from "../types/settings.types";

const defaultNameTemplates: Record<JournalSettings["write"]["type"], string> = {
  day: "{{date}}",
  week: "{{date}}",
  month: "{{date}}",
  quarter: "{{date}}",
  year: "{{date}}",
  weekdays: "",
  custom: "{{journal_name}} {{start_date}} - {{end_date}}",
};

const defaultDateFormats: Record<JournalSettings["write"]["type"], string> = {
  day: "YYYY-MM-DD",
  week: "YYYY-[W]ww",
  month: "YYYY-MM",
  quarter: "YYYY-[Q]Q",
  year: "YYYY",
  weekdays: "",
  custom: "YYYY-MM-DD",
};
const emptyNavRow: NavBlockRow = {
  template: "",
  fontSize: 1,
  bold: false,
  italic: false,
  link: "none",
  journal: "",
};

const rowNavWeek: NavBlockRow = {
  ...emptyNavRow,
  template: "{{date:[W]w}}",
  link: "week",
};
const rowNavMonth: NavBlockRow = {
  ...emptyNavRow,
  template: "{{date:MMMM}}",
  link: "month",
};
const rowNavYear: NavBlockRow = {
  ...emptyNavRow,
  template: "{{date:YYYY}}",
  link: "year",
};
const rowNavRelative: NavBlockRow = {
  ...emptyNavRow,
  template: "{{relative_date}}",
  fontSize: 0.7,
};

const defaultNavBlocks: Record<JournalSettings["write"]["type"], JournalSettings["navBlock"]> = {
  day: {
    type: "create",
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
      },
      rowNavRelative,
      rowNavWeek,
      rowNavMonth,
      rowNavYear,
    ],
  },
  week: {
    type: "create",
    rows: [
      {
        ...rowNavWeek,
        fontSize: 3,
        bold: true,
        link: "self",
      },
      rowNavRelative,
      rowNavMonth,
      rowNavYear,
    ],
  },
  month: {
    type: "create",
    rows: [
      {
        ...rowNavMonth,
        fontSize: 3,
        bold: true,
        link: "self",
      },
      rowNavRelative,
      rowNavYear,
    ],
  },
  quarter: {
    type: "create",
    rows: [
      {
        ...emptyNavRow,
        template: "{{date:[Q]Q}}",
        fontSize: 3,
        bold: true,
        link: "self",
      },
      rowNavRelative,
      rowNavYear,
    ],
  },
  year: {
    type: "create",
    rows: [
      {
        ...rowNavYear,
        fontSize: 3,
        bold: true,
        link: "self",
      },
      rowNavRelative,
    ],
  },
  weekdays: {
    type: "create",
    rows: [],
  },
  custom: {
    type: "create",
    rows: [
      {
        ...emptyNavRow,
        template: "{{journal_name}}",
        link: "self",
        fontSize: 3,
        bold: true,
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

export function prepareJournalDefaultsBasedOnType(write: JournalSettings["write"]): Partial<JournalSettings> {
  const defaults: Partial<JournalSettings> = {
    nameTemplate: defaultNameTemplates[write.type],
    dateFormat: defaultDateFormats[write.type],
    navBlock: defaultNavBlocks[write.type],
    calendarViewBlock: {
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
    },
  };
  if (write.type === "custom") {
    defaults.start = write.anchorDate;
  }

  return defaults;
}
