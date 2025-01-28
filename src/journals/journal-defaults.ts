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
  week: "YYYY-[W]W",
  month: "YYYY-MM",
  quarter: "YYYY-[Q]Q",
  year: "YYYY",
  weekdays: "",
  custom: "YYYY-MM-DD",
};
export const emptyNavRow: NavBlockRow = {
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
  weekdays: {
    type: "create",
    decorateWholeBlock: false,
    rows: [],
  },
  custom: {
    type: "create",
    decorateWholeBlock: false,
    rows: [
      {
        ...emptyNavRow,
        template: "{{journal_name}}",
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

export function prepareJournalDefaultsBasedOnType(write: JournalSettings["write"]): Partial<JournalSettings> {
  const defaults: Partial<JournalSettings> = {
    nameTemplate: defaultNameTemplates[write.type],
    dateFormat: defaultDateFormats[write.type],
    navBlock: defaultNavBlocks[write.type],
    calendarViewBlock: {
      decorateWholeBlock: false,
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
