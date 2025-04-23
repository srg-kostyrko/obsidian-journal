import type { JournalSettings, NavBlockRow } from "../types/settings.types";

export const defaultNameTemplates: Record<JournalSettings["write"]["type"], string> = {
  day: "{{date}}",
  week: "{{date}}",
  month: "{{date}}",
  quarter: "{{date}}",
  year: "{{date}}",
  custom: "{{journal_name}} {{index}}",
};

export const defaultDateFormats: Record<JournalSettings["write"]["type"], string> = {
  day: "YYYY-MM-DD",
  week: "YYYY-[W]w",
  month: "YYYY-MM",
  quarter: "YYYY-[Q]Q",
  year: "YYYY",
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

export function prepareJournalDefaultsBasedOnType(write: JournalSettings["write"]): Partial<JournalSettings> {
  const defaults: Partial<JournalSettings> = {
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
