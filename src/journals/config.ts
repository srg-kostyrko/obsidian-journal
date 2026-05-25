import * as v from "valibot";

import type { AnchorString } from "@/calendar";
import { decorationSchema } from "@/decorations/config";
import { defineCollection } from "@/settings";

export const FRONTMATTER_NAME_KEY = "journal";

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

const EMPTY_ANCHOR = "" as AnchorString;

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

  return {
    name,
    write,
    timeline: { start: EMPTY_ANCHOR, end: { kind: "never" } },
    dateFormat: DATE_FORMATS[write.type],
    frontmatter: {
      dateField: "journal-date",
      startDateField: "journal-start-date",
      endDateField: "journal-end-date",
      addStartDate: false,
      addEndDate: false,
    },
    numbering: write.type === "custom" ? numberingForCustom : numberingForFixed,
    nameTemplate: "{{date}}",
    folder: "",
    templates: [],
    confirmCreation: false,
    autoCreate: false,
    decorations: [],
  };
}

export const journalConfigCollection = defineCollection("journals", journalConfigSchema, (id) =>
  journalDefaultsFor({ type: "day" }, id),
);
