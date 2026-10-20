import * as v from "valibot";

import type { AnchorString } from "@/calendar";
import { colorSchema, decorationSchema, type JournalDecoration } from "@/decorations/config";
import { defineCollection } from "@/settings";
import { climb } from "@/settings/repair";
import { taskRuleSchema } from "@/tasks/conditions";
import { checkboxJournalRuleSchema } from "@/tasks/providers/checkbox/rule-schema";
import { visibilityRuleSchema } from "@/tasks/visibility-rule/rule";

import { DEFAULT_NOTELET_FIELD, noteletTypeCollection, noteletTypeSchema } from "./notelets/config";
import { promptsSchema } from "./prompts/config";

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
  DEFAULT_NOTELET_FIELD,
] as const;

const anchorString = v.pipe(
  v.string(),
  v.regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
  v.transform((s) => s as AnchorString),
);

// "" is the sentinel for an unset anchor — a timeline's start and end and the
// numbering anchor are all legitimately empty until the user picks a date.
const optionalAnchorString = v.pipe(
  v.union([v.literal(""), anchorString]),
  v.transform((s) => s as AnchorString),
);

const ownsNotes = "a different period owns different notes";

const writeFixed = v.object({
  type: v.pipe(v.picklist(["day", "week", "month", "quarter", "year"]), climb(ownsNotes)),
});

const writeCustom = v.object({
  type: v.pipe(v.literal("custom"), climb(ownsNotes)),
  every: v.pipe(v.picklist(["day", "week", "month", "quarter", "year"]), climb(ownsNotes)),
  duration: v.pipe(v.number(), v.integer(), v.minValue(1), climb(ownsNotes)),
  anchorDate: v.pipe(anchorString, climb(ownsNotes)),
});

const writeSchema = v.variant("type", [writeFixed, writeCustom]);

const widensTimeline = "an unset bound shows periods the user cut off";

const timelineEnd = v.variant("kind", [
  v.object({ kind: v.pipe(v.literal("never"), climb("discriminant")) }),
  v.object({
    kind: v.pipe(v.literal("date"), climb("discriminant")),
    date: v.pipe(optionalAnchorString, climb(widensTimeline)),
  }),
  v.object({
    kind: v.pipe(v.literal("repeats"), climb("discriminant")),
    count: v.pipe(v.number(), v.integer(), v.minValue(1), climb(widensTimeline)),
  }),
]);

const timelineSchema = v.object({
  start: v.pipe(optionalAnchorString, climb(widensTimeline)),
  end: v.pipe(timelineEnd, climb(widensTimeline)),
});

const keyedNotes = "existing notes carry this key; a default orphans them";

const frontmatterFieldsSchema = v.object({
  dateField: v.pipe(v.string(), v.minLength(1), climb(keyedNotes)),
  startDateField: v.pipe(v.string(), v.minLength(1), climb(keyedNotes)),
  endDateField: v.pipe(v.string(), v.minLength(1), climb(keyedNotes)),
  noteletField: v.optional(v.pipe(v.string(), v.minLength(1)), DEFAULT_NOTELET_FIELD),
  addStartDate: v.optional(v.boolean(), false),
  addEndDate: v.optional(v.boolean(), false),
});

const renumbers = "a default renumbers existing notes";

const numberingReset = v.variant("kind", [
  v.object({ kind: v.pipe(v.literal("never"), climb("discriminant")) }),
  v.object({
    kind: v.pipe(v.literal("after"), climb("discriminant")),
    count: v.pipe(v.number(), v.integer(), v.minValue(1), climb(renumbers)),
  }),
]);

const numberingSource = v.object({
  variable: v.pipe(v.string(), v.minLength(1), climb("templates name the source by its variable")),
  frontmatterKey: v.pipe(v.string(), v.minLength(1), climb(keyedNotes)),
  anchorValue: v.pipe(v.number(), v.integer(), climb(renumbers)),
  reset: v.pipe(numberingReset, climb(renumbers)),
});

const numberingSchema = v.pipe(
  v.object({
    // Its default depends on the write type, which a field default cannot see.
    enabled: v.pipe(v.boolean(), climb("on for custom journals, off for fixed ones")),
    anchorDate: v.pipe(optionalAnchorString, climb(renumbers)),
    allowBefore: v.optional(v.boolean(), false),
    sources: v.optional(v.array(numberingSource), () => []),
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

const navBlockSegmentLinkSchema = v.union([
  v.literal("none"),
  v.literal("self"),
  v.literal("journal"),
  v.picklist(["day", "week", "month", "quarter", "year"]),
]);

export const navBlockSegmentSchema = v.object({
  template: v.optional(v.string(), ""),
  fontSize: v.optional(v.number(), 1),
  bold: v.optional(v.boolean(), false),
  italic: v.optional(v.boolean(), false),
  color: v.optional(colorSchema, () => ({ type: "theme" as const, name: "text-normal" })),
  background: v.optional(colorSchema, () => ({ type: "transparent" as const })),
  link: v.optional(navBlockSegmentLinkSchema, "none"),
  journal: v.optional(v.string(), ""),
  linkDate: v.optional(v.string(), ""),
  addDecorations: v.optional(v.boolean(), false),
});

export const navBlockSchema = v.object({
  type: v.optional(v.picklist(["create", "existing"]), "create"),
  lines: v.optional(v.array(v.array(navBlockSegmentSchema)), () => []),
  decorateWholeBlock: v.optional(v.boolean(), false),
  // Read only by the navigation block — the interval block has no adjacent periods, the way
  // it has no use for `type` either.
  showAdjacent: v.optional(v.picklist(["all", "desktop", "mobile", "none"]), "all"),
});

export type NavBlockSegmentLink = v.InferOutput<typeof navBlockSegmentLinkSchema>;
export type NavBlockSegment = v.InferOutput<typeof navBlockSegmentSchema>;
export type JournalNavBlock = v.InferOutput<typeof navBlockSchema>;
export type AdjacentDevices = JournalNavBlock["showAdjacent"];

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
  prompts: v.optional(promptsSchema, () => []),
  notelets: v.optional(v.record(v.string(), noteletTypeSchema), () => ({})),
  tasks: v.optional(
    v.object({
      // Keyed by provider id, the key TaskHost reads a journal's rule under. Kept in its own object
      // so the listing filter below is not a sibling of the provider namespace.
      providers: v.optional(
        v.object({
          // A rule whose conditions cannot be read inherits the global rule whole: repairing inside
          // it could leave a `replace` rule with no conditions, which counts every checkbox a task.
          checkbox: v.optional(v.fallback(v.optional(checkboxJournalRuleSchema), undefined)),
          "note-property": v.optional(visibilityRuleSchema),
        }),
        () => ({}),
      ),
      filter: v.optional(taskRuleSchema, () => v.parse(taskRuleSchema, {})),
    }),
    () => ({ providers: {}, filter: v.parse(taskRuleSchema, {}) }),
  ),
  navBlock: v.optional(navBlockSchema, () => ({
    type: "create" as const,
    lines: [] as NavBlockSegment[][],
    decorateWholeBlock: false,
  })),
  intervalBlock: v.optional(navBlockSchema, () => ({
    type: "create" as const,
    lines: [] as NavBlockSegment[][],
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

// A prompt or numbering digit keyed to one of these overwrites the note's own journal claim or
// date fields, since frontmatter.ts writes them after — see EditPromptModal and
// EditNumberingDigitModal's takenKeys.
export function reservedFrontmatterKeys(config: Pick<JournalConfig, "frontmatter">): readonly string[] {
  return [
    FRONTMATTER_NAME_KEY,
    config.frontmatter.dateField,
    config.frontmatter.startDateField,
    config.frontmatter.endDateField,
    config.frontmatter.noteletField,
  ];
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

const NAME_TEMPLATES: Record<JournalWrite["type"], string> = {
  day: "{{date}}",
  week: "{{date}}",
  month: "{{date}}",
  quarter: "{{date}}",
  year: "{{date}}",
  custom: "{{journal_name}} {{index}}",
};

const EMPTY_ANCHOR = "" as AnchorString;

const emptyNavSegment: NavBlockSegment = {
  template: "",
  fontSize: 1,
  bold: false,
  italic: false,
  link: "none",
  journal: "",
  linkDate: "",
  color: { type: "theme", name: "text-normal" },
  background: { type: "transparent" },
  addDecorations: false,
};

const segNavWeek: NavBlockSegment = { ...emptyNavSegment, template: "{{date:[W]w}}", link: "week" };
const segNavMonth: NavBlockSegment = { ...emptyNavSegment, template: "{{date:MMMM}}", link: "month" };
const segNavYear: NavBlockSegment = { ...emptyNavSegment, template: "{{date:YYYY}}", link: "year" };
const segNavRelative: NavBlockSegment = { ...emptyNavSegment, template: "{{relative_date}}", fontSize: 0.7 };

const defaultNavBlocks: Record<JournalWrite["type"], JournalNavBlock> = {
  day: {
    type: "create",
    showAdjacent: "all",
    decorateWholeBlock: false,
    lines: [
      [{ ...emptyNavSegment, template: "{{date:ddd}}" }],
      [{ ...emptyNavSegment, template: "{{date:D}}", fontSize: 3, bold: true, link: "self", addDecorations: true }],
      [segNavRelative],
      [segNavWeek],
      [segNavMonth],
      [segNavYear],
    ],
  },
  week: {
    type: "create",
    showAdjacent: "all",
    decorateWholeBlock: false,
    lines: [
      [{ ...segNavWeek, fontSize: 3, bold: true, link: "self", addDecorations: true }],
      [segNavRelative],
      [segNavMonth],
      [segNavYear],
    ],
  },
  month: {
    type: "create",
    showAdjacent: "all",
    decorateWholeBlock: false,
    lines: [
      [{ ...segNavMonth, fontSize: 3, bold: true, link: "self", addDecorations: true }],
      [segNavRelative],
      [segNavYear],
    ],
  },
  quarter: {
    type: "create",
    showAdjacent: "all",
    decorateWholeBlock: false,
    lines: [
      [{ ...emptyNavSegment, template: "{{date:[Q]Q}}", fontSize: 3, bold: true, link: "self", addDecorations: true }],
      [segNavRelative],
      [segNavYear],
    ],
  },
  year: {
    type: "create",
    showAdjacent: "all",
    decorateWholeBlock: false,
    lines: [[{ ...segNavYear, fontSize: 3, bold: true, link: "self", addDecorations: true }], [segNavRelative]],
  },
  custom: {
    type: "create",
    showAdjacent: "all",
    decorateWholeBlock: false,
    lines: [
      [
        {
          ...emptyNavSegment,
          template: "{{journal_name}} {{index}}",
          link: "self",
          fontSize: 3,
          bold: true,
          addDecorations: true,
        },
      ],
      [{ ...emptyNavSegment, template: "{{start_date}}" }],
      [{ ...emptyNavSegment, template: "to" }],
      [{ ...emptyNavSegment, template: "{{end_date}}" }],
    ],
  },
};

const emptyIntervalBlock: JournalNavBlock = {
  type: "create",
  lines: [],
  decorateWholeBlock: false,
  showAdjacent: "all",
};

const customIntervalBlock: JournalNavBlock = {
  type: "create",
  decorateWholeBlock: true,
  showAdjacent: "all",
  lines: [
    [{ ...emptyNavSegment, template: "{{journal_name}} {{index}}", link: "self", fontSize: 1.2, bold: true }],
    [{ ...emptyNavSegment, template: "{{start_date}} to {{end_date}}" }],
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
      noteletField: DEFAULT_NOTELET_FIELD,
      addStartDate: false,
      addEndDate: false,
    },
    numbering: isCustom ? numberingForCustom : numberingForFixed,
    nameTemplate: NAME_TEMPLATES[write.type],
    folder: "",
    templates: [],
    prompts: [],
    notelets: {},
    tasks: { providers: {}, filter: v.parse(taskRuleSchema, {}) },
    confirmCreation: false,
    autoCreate: false,
    decorations: structuredClone(isCustom ? customDecorations : fixedDecorations),
    navBlock: structuredClone(defaultNavBlocks[write.type]),
    intervalBlock: structuredClone(isCustom ? customIntervalBlock : emptyIntervalBlock),
  };
}

function storedWrite(raw: unknown): JournalWrite {
  const parsed = v.safeParse(writeSchema, (raw as { write?: unknown } | null)?.write);
  return parsed.success ? parsed.output : { type: "day" };
}

export const journalConfigCollection = defineCollection(
  "journals",
  journalConfigSchema,
  (id, raw) => journalDefaultsFor(storedWrite(raw), id),
  { nested: { notelets: noteletTypeCollection } },
);
