import * as v from "valibot";

import type { AnchorString } from "@/calendar";
import { colorSchema, decorationSchema, type JournalDecoration } from "@/decorations/config";
import { defineCollection } from "@/settings";

export const FRONTMATTER_NAME_KEY = "journal";

// Frontmatter keys an orphaned note may still carry when no journal config exists.
// Used to strip journal data in NoteConnectionService.disconnect for orphaned notes.
// Keep in sync with the default frontmatter field names below.
export const DEFAULT_FRONTMATTER_KEYS = [
  FRONTMATTER_NAME_KEY,
  "journal-date",
  "journal-start-date",
  "journal-end-date",
  "journal-index",
] as const;

const anchorString = v.pipe(
  v.string(),
  v.regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
  v.transform((s) => s as AnchorString),
);

// "" is the sentinel for an unset anchor — the start of a timeline and the
// numbering anchor are both legitimately empty until the user picks a date.
const optionalAnchorString = v.pipe(
  v.union([v.literal(""), anchorString]),
  v.transform((s) => s as AnchorString),
);

const writeFixed = v.object({
  type: v.picklist(["day", "week", "month", "quarter", "year"]),
});

const writeCustom = v.object({
  type: v.literal("custom"),
  every: v.picklist(["day", "week", "month", "quarter", "year"]),
  duration: v.pipe(v.number(), v.integer(), v.minValue(1)),
  anchorDate: anchorString,
});

const writeSchema = v.union([writeFixed, writeCustom]);

const timelineEnd = v.union([
  v.object({ kind: v.literal("never") }),
  v.object({ kind: v.literal("date"), date: anchorString }),
  v.object({ kind: v.literal("repeats"), count: v.pipe(v.number(), v.integer(), v.minValue(1)) }),
]);

const timelineSchema = v.object({
  start: optionalAnchorString,
  end: timelineEnd,
});

const frontmatterFieldsSchema = v.object({
  dateField: v.pipe(v.string(), v.minLength(1)),
  startDateField: v.pipe(v.string(), v.minLength(1)),
  endDateField: v.pipe(v.string(), v.minLength(1)),
  addStartDate: v.boolean(),
  addEndDate: v.boolean(),
});

const numberingReset = v.union([
  v.object({ kind: v.literal("never") }),
  v.object({ kind: v.literal("after"), count: v.pipe(v.number(), v.integer(), v.minValue(1)) }),
]);

const numberingSource = v.object({
  variable: v.pipe(v.string(), v.minLength(1)),
  frontmatterKey: v.pipe(v.string(), v.minLength(1)),
  anchorValue: v.pipe(v.number(), v.integer()),
  reset: numberingReset,
});

const numberingSchema = v.pipe(
  v.object({
    enabled: v.boolean(),
    anchorDate: optionalAnchorString,
    allowBefore: v.boolean(),
    sources: v.array(numberingSource),
  }),
  v.check(
    (value) => new Set(value.sources.map((s) => s.variable)).size === value.sources.length,
    "numbering source `variable` values must be unique",
  ),
  v.check(
    (value) => new Set(value.sources.map((s) => s.frontmatterKey)).size === value.sources.length,
    "numbering source `frontmatterKey` values must be unique",
  ),
);

const navBlockRowLinkSchema = v.union([
  v.literal("none"),
  v.literal("self"),
  v.literal("journal"),
  v.picklist(["day", "week", "month", "quarter", "year"]),
]);

export const navBlockRowSchema = v.object({
  template: v.string(),
  fontSize: v.number(),
  bold: v.boolean(),
  italic: v.boolean(),
  color: colorSchema,
  background: colorSchema,
  link: navBlockRowLinkSchema,
  journal: v.string(),
  addDecorations: v.boolean(),
});

export const navBlockSchema = v.object({
  type: v.picklist(["create", "existing"]),
  rows: v.array(navBlockRowSchema),
  decorateWholeBlock: v.boolean(),
});

export type NavBlockRowLink = v.InferOutput<typeof navBlockRowLinkSchema>;
export type NavBlockRow = v.InferOutput<typeof navBlockRowSchema>;
export type JournalNavBlock = v.InferOutput<typeof navBlockSchema>;

export const journalConfigSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1)),
  write: writeSchema,
  timeline: timelineSchema,
  dateFormat: v.pipe(v.string(), v.minLength(1)),
  frontmatter: frontmatterFieldsSchema,
  numbering: numberingSchema,
  // Back-compat: existing settings tests and persisted configs predate these
  // five fields. v.optional with a default lets old shapes parse cleanly until
  // a migration is in place. Drop the optional wrappers once migration lands.
  nameTemplate: v.optional(v.string(), "{{date}}"),
  folder: v.optional(v.string(), ""),
  templates: v.optional(v.array(v.string()), []),
  confirmCreation: v.optional(v.boolean(), false),
  autoCreate: v.optional(v.boolean(), false),
  decorations: v.optional(v.array(decorationSchema), []),
  navBlock: v.optional(navBlockSchema, () => ({
    type: "create" as const,
    rows: [] as NavBlockRow[],
    decorateWholeBlock: false,
  })),
  intervalBlock: v.optional(navBlockSchema, () => ({
    type: "create" as const,
    rows: [] as NavBlockRow[],
    decorateWholeBlock: false,
  })),
});

export type FixedWriteIntervals = v.InferOutput<typeof writeFixed>;
export type WriteCustom = v.InferOutput<typeof writeCustom>;
export type JournalWrite = v.InferOutput<typeof writeSchema>;
export type TimelineEnd = v.InferOutput<typeof timelineEnd>;
export type JournalTimeline = v.InferOutput<typeof timelineSchema>;
export type FrontmatterFields = v.InferOutput<typeof frontmatterFieldsSchema>;
export type NumberingReset = v.InferOutput<typeof numberingReset>;
export type NumberingSource = v.InferOutput<typeof numberingSource>;
export type JournalNumberingConfig = v.InferOutput<typeof numberingSchema>;
export type JournalConfig = v.InferOutput<typeof journalConfigSchema>;

// --- Defaults ---

const DATE_FORMATS: Record<JournalWrite["type"], string> = {
  day: "YYYY-MM-DD",
  week: "YYYY-[W]w",
  month: "YYYY-MM",
  quarter: "YYYY-[Q]Q",
  year: "YYYY",
  custom: "YYYY-MM-DD",
};

const NAME_TEMPLATES: Record<JournalWrite["type"], string> = {
  day: "{{date}}",
  week: "{{date}}",
  month: "{{date}}",
  quarter: "{{date}}",
  year: "{{date}}",
  custom: "{{journal_name}} {{index}}",
};

const EMPTY_ANCHOR = "" as AnchorString;

const emptyNavRow: NavBlockRow = {
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

const rowNavWeek: NavBlockRow = { ...emptyNavRow, template: "{{date:[W]w}}", link: "week" };
const rowNavMonth: NavBlockRow = { ...emptyNavRow, template: "{{date:MMMM}}", link: "month" };
const rowNavYear: NavBlockRow = { ...emptyNavRow, template: "{{date:YYYY}}", link: "year" };
const rowNavRelative: NavBlockRow = { ...emptyNavRow, template: "{{relative_date}}", fontSize: 0.7 };

const defaultNavBlocks: Record<JournalWrite["type"], JournalNavBlock> = {
  day: {
    type: "create",
    decorateWholeBlock: false,
    rows: [
      { ...emptyNavRow, template: "{{date:ddd}}" },
      { ...emptyNavRow, template: "{{date:D}}", fontSize: 3, bold: true, link: "self", addDecorations: true },
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
      { ...rowNavWeek, fontSize: 3, bold: true, link: "self", addDecorations: true },
      rowNavRelative,
      rowNavMonth,
      rowNavYear,
    ],
  },
  month: {
    type: "create",
    decorateWholeBlock: false,
    rows: [{ ...rowNavMonth, fontSize: 3, bold: true, link: "self", addDecorations: true }, rowNavRelative, rowNavYear],
  },
  quarter: {
    type: "create",
    decorateWholeBlock: false,
    rows: [
      { ...emptyNavRow, template: "{{date:[Q]Q}}", fontSize: 3, bold: true, link: "self", addDecorations: true },
      rowNavRelative,
      rowNavYear,
    ],
  },
  year: {
    type: "create",
    decorateWholeBlock: false,
    rows: [{ ...rowNavYear, fontSize: 3, bold: true, link: "self", addDecorations: true }, rowNavRelative],
  },
  custom: {
    type: "create",
    decorateWholeBlock: false,
    rows: [
      {
        ...emptyNavRow,
        template: "{{journal_name}} {{index}}",
        link: "self",
        fontSize: 2,
        bold: true,
        addDecorations: true,
      },
      { ...emptyNavRow, template: "{{start_date}}" },
      { ...emptyNavRow, template: "to" },
      { ...emptyNavRow, template: "{{end_date}}" },
    ],
  },
};

const emptyIntervalBlock: JournalNavBlock = { type: "create", rows: [], decorateWholeBlock: false };

const customIntervalBlock: JournalNavBlock = {
  type: "create",
  decorateWholeBlock: true,
  rows: [
    { ...emptyNavRow, template: "{{journal_name}} {{index}}", link: "self", fontSize: 1.2, bold: true },
    { ...emptyNavRow, template: "{{start_date}} to {{end_date}}" },
  ],
};

const fixedDecorations: JournalDecoration[] = [
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
];

const customDecorations: JournalDecoration[] = [
  {
    mode: "and",
    conditions: [{ type: "has-note" }],
    styles: [
      {
        type: "border",
        border: "different",
        left: { show: true, width: 2, color: { type: "theme", name: "interactive-accent" }, style: "solid" },
        right: { show: false, width: 1, color: { type: "transparent" }, style: "solid" },
        top: { show: false, width: 1, color: { type: "transparent" }, style: "solid" },
        bottom: { show: false, width: 1, color: { type: "transparent" }, style: "solid" },
      },
    ],
  },
];

export function journalDefaultsFor(write: JournalWrite, name = ""): JournalConfig {
  const numberingForCustom: JournalNumberingConfig = {
    enabled: true,
    anchorDate: write.type === "custom" ? write.anchorDate : EMPTY_ANCHOR,
    allowBefore: false,
    sources: [
      {
        variable: "index",
        frontmatterKey: "journal-index",
        anchorValue: 1,
        reset: { kind: "never" },
      },
    ],
  };

  const numberingForFixed: JournalNumberingConfig = {
    enabled: false,
    anchorDate: EMPTY_ANCHOR,
    allowBefore: false,
    sources: [],
  };

  const isCustom = write.type === "custom";

  return {
    name,
    write,
    timeline: { start: isCustom ? write.anchorDate : EMPTY_ANCHOR, end: { kind: "never" } },
    dateFormat: DATE_FORMATS[write.type],
    frontmatter: {
      dateField: "journal-date",
      startDateField: "journal-start-date",
      endDateField: "journal-end-date",
      addStartDate: false,
      addEndDate: false,
    },
    numbering: isCustom ? numberingForCustom : numberingForFixed,
    nameTemplate: NAME_TEMPLATES[write.type],
    folder: "",
    templates: [],
    confirmCreation: false,
    autoCreate: false,
    decorations: isCustom ? customDecorations : fixedDecorations,
    navBlock: defaultNavBlocks[write.type],
    intervalBlock: isCustom ? customIntervalBlock : emptyIntervalBlock,
  };
}

export const journalConfigCollection = defineCollection("journals", journalConfigSchema, (id) =>
  journalDefaultsFor({ type: "day" }, id),
);
