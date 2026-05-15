import * as v from "valibot";

import type { AnchorString } from "@/calendar";
import { defineCollection } from "@/settings";

export const FRONTMATTER_NAME_KEY = "journal";

const anchorString = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"));

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
  start: anchorString,
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
    anchorDate: anchorString,
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
});

// --- Public types ---
// AnchorString fields are typed with the calendar brand rather than plain string
// so callers can pass them without re-casting.

export interface FixedWriteIntervals {
  type: "day" | "week" | "month" | "quarter" | "year";
}

export interface WriteCustom {
  type: "custom";
  every: "day" | "week" | "month" | "quarter" | "year";
  duration: number;
  anchorDate: AnchorString;
}

export type JournalWrite = FixedWriteIntervals | WriteCustom;

export type TimelineEnd = { kind: "never" } | { kind: "date"; date: AnchorString } | { kind: "repeats"; count: number };

export interface JournalTimeline {
  start: AnchorString;
  end: TimelineEnd;
}

export interface FrontmatterFields {
  dateField: string;
  startDateField: string;
  endDateField: string;
  addStartDate: boolean;
  addEndDate: boolean;
}

export type NumberingReset = { kind: "never" } | { kind: "after"; count: number };

export interface NumberingSource {
  variable: string;
  frontmatterKey: string;
  anchorValue: number;
  reset: NumberingReset;
}

export interface JournalNumberingConfig {
  enabled: boolean;
  anchorDate: AnchorString;
  allowBefore: boolean;
  sources: NumberingSource[];
}

export interface JournalConfig {
  name: string;
  write: JournalWrite;
  timeline: JournalTimeline;
  dateFormat: string;
  frontmatter: FrontmatterFields;
  numbering: JournalNumberingConfig;
}

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
  };
}

export const journalConfigCollection = defineCollection("journals", journalConfigSchema, (id) =>
  journalDefaultsFor({ type: "day" }, id),
);
