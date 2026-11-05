import * as v from "valibot";

import { colorSchema, type ColorSettings } from "@/decorations";
import { defineSlice } from "@/settings";

const weightSchema = v.picklist(["normal", "semibold", "bold"]);
const styleSchema = v.picklist(["ring", "background", "text", "none"]);
const caseSchema = v.picklist(["none", "upper", "lower", "title"]);
const strengthSchema = v.pipe(v.number(), v.integer(), v.minValue(5), v.maxValue(100));
const pixelsSchema = v.pipe(v.number(), v.minValue(0));

export type Weight = v.InferOutput<typeof weightSchema>;
export type HighlightStyle = v.InferOutput<typeof styleSchema>;
export type TextCase = v.InferOutput<typeof caseSchema>;

// A null text value is "as today": nothing is written for it, so whatever renders underneath shows.
export interface HighlightValues {
  style: HighlightStyle;
  color: ColorSettings;
  ringWidth: number;
  strength: number;
  text: { color: ColorSettings | null; weight: Weight | null; italic: boolean | null };
  over: boolean;
}

export interface TextValues {
  size: string;
  weight: Weight | null;
  italic: boolean | null;
  color: ColorSettings | null;
  case: TextCase | null;
}

export interface BoxValues {
  padding: number;
  radius: string;
  gap: string;
  minHeight: number;
}

export interface AppearanceParts {
  today: HighlightValues;
  selected: HighlightValues;
  active: HighlightValues;
  outside: HighlightValues;
  heading: TextValues;
  weekday: TextValues;
  weekNumber: TextValues;
  date: TextValues;
  cell: BoxValues;
}

export type Overrides<T> = { [K in keyof T]: T[K] | null };

export type NarrowHighlight = Overrides<Omit<HighlightValues, "text">> & { text: HighlightValues["text"] };

export type NarrowOverrides = {
  [P in keyof AppearanceParts]: AppearanceParts[P] extends HighlightValues
    ? NarrowHighlight
    : Overrides<AppearanceParts[P]>;
};

export interface AppearanceSliceState {
  wide: AppearanceParts;
  narrow: NarrowOverrides;
}

const theme = (name: string): ColorSettings => ({ type: "theme", name });
const transparent = (): ColorSettings => ({ type: "transparent" });

function highlight(overrides: Partial<HighlightValues>): HighlightValues {
  return {
    style: "text",
    color: transparent(),
    ringWidth: 2,
    strength: 100,
    text: { color: null, weight: null, italic: null },
    over: false,
    ...overrides,
  };
}

function text(overrides: Partial<TextValues>): TextValues {
  return { size: "inherit", weight: null, italic: null, color: null, case: null, ...overrides };
}

const wideDefaults: AppearanceParts = {
  today: highlight({ text: { color: theme("text-accent"), weight: null, italic: null } }),
  selected: highlight({ style: "ring", color: theme("interactive-accent"), over: true }),
  active: highlight({
    style: "background",
    color: theme("interactive-accent"),
    text: { color: theme("text-on-accent"), weight: null, italic: null },
  }),
  outside: highlight({ text: { color: theme("text-muted"), weight: null, italic: null } }),
  heading: text({}),
  weekday: text({ size: "0.6em", color: theme("text-muted") }),
  weekNumber: text({ weight: "bold" }),
  date: text({}),
  cell: { padding: 0, radius: "var(--radius-s)", gap: "var(--size-2-1)", minHeight: 26 },
};

function nulls<T extends object>(value: T): Overrides<T> {
  return Object.fromEntries(Object.keys(value).map((key) => [key, null])) as Overrides<T>;
}

function narrowHighlight(): NarrowHighlight {
  return { ...nulls(highlight({})), text: { color: null, weight: null, italic: null } };
}

const narrowDefaults: NarrowOverrides = {
  today: narrowHighlight(),
  selected: narrowHighlight(),
  active: narrowHighlight(),
  outside: narrowHighlight(),
  heading: nulls(wideDefaults.heading),
  weekday: nulls(wideDefaults.weekday),
  weekNumber: nulls(wideDefaults.weekNumber),
  date: nulls(wideDefaults.date),
  cell: nulls(wideDefaults.cell),
};

const fresh =
  <T>(value: T) =>
  (): T =>
    structuredClone(value);

function textOfHighlightSchema(defaults: HighlightValues["text"]) {
  return v.object({
    color: v.optional(v.nullable(colorSchema), fresh(defaults.color)),
    weight: v.optional(v.nullable(weightSchema), defaults.weight),
    italic: v.optional(v.nullable(v.boolean()), defaults.italic),
  });
}

function highlightSchema(defaults: HighlightValues) {
  return v.object({
    style: v.optional(styleSchema, defaults.style),
    color: v.optional(colorSchema, fresh(defaults.color)),
    ringWidth: v.optional(pixelsSchema, defaults.ringWidth),
    strength: v.optional(strengthSchema, defaults.strength),
    text: v.optional(textOfHighlightSchema(defaults.text), fresh(defaults.text)),
    over: v.optional(v.boolean(), defaults.over),
  });
}

function textSchema(defaults: TextValues) {
  return v.object({
    size: v.optional(v.string(), defaults.size),
    weight: v.optional(v.nullable(weightSchema), defaults.weight),
    italic: v.optional(v.nullable(v.boolean()), defaults.italic),
    color: v.optional(v.nullable(colorSchema), fresh(defaults.color)),
    case: v.optional(v.nullable(caseSchema), defaults.case),
  });
}

function boxSchema(defaults: BoxValues) {
  return v.object({
    padding: v.optional(pixelsSchema, defaults.padding),
    radius: v.optional(v.string(), defaults.radius),
    gap: v.optional(v.string(), defaults.gap),
    minHeight: v.optional(pixelsSchema, defaults.minHeight),
  });
}

// A corrupt override repairs to "no override": the wide value still applies, so nothing is lost.
const override = <T extends v.GenericSchema>(schema: T) => v.optional(v.nullable(schema), null);

const narrowHighlightSchema = v.object({
  style: override(styleSchema),
  color: override(colorSchema),
  ringWidth: override(pixelsSchema),
  strength: override(strengthSchema),
  text: v.optional(
    v.object({ color: override(colorSchema), weight: override(weightSchema), italic: override(v.boolean()) }),
    fresh(narrowDefaults.today.text),
  ),
  over: override(v.boolean()),
});

const narrowTextSchema = v.object({
  size: override(v.string()),
  weight: override(weightSchema),
  italic: override(v.boolean()),
  color: override(colorSchema),
  case: override(caseSchema),
});

const narrowBoxSchema = v.object({
  padding: override(pixelsSchema),
  radius: override(v.string()),
  gap: override(v.string()),
  minHeight: override(pixelsSchema),
});

const wideSchema = v.object({
  today: v.optional(highlightSchema(wideDefaults.today), fresh(wideDefaults.today)),
  selected: v.optional(highlightSchema(wideDefaults.selected), fresh(wideDefaults.selected)),
  active: v.optional(highlightSchema(wideDefaults.active), fresh(wideDefaults.active)),
  outside: v.optional(highlightSchema(wideDefaults.outside), fresh(wideDefaults.outside)),
  heading: v.optional(textSchema(wideDefaults.heading), fresh(wideDefaults.heading)),
  weekday: v.optional(textSchema(wideDefaults.weekday), fresh(wideDefaults.weekday)),
  weekNumber: v.optional(textSchema(wideDefaults.weekNumber), fresh(wideDefaults.weekNumber)),
  date: v.optional(textSchema(wideDefaults.date), fresh(wideDefaults.date)),
  cell: v.optional(boxSchema(wideDefaults.cell), fresh(wideDefaults.cell)),
});

const narrowSchema = v.object({
  today: v.optional(narrowHighlightSchema, fresh(narrowDefaults.today)),
  selected: v.optional(narrowHighlightSchema, fresh(narrowDefaults.selected)),
  active: v.optional(narrowHighlightSchema, fresh(narrowDefaults.active)),
  outside: v.optional(narrowHighlightSchema, fresh(narrowDefaults.outside)),
  heading: v.optional(narrowTextSchema, fresh(narrowDefaults.heading)),
  weekday: v.optional(narrowTextSchema, fresh(narrowDefaults.weekday)),
  weekNumber: v.optional(narrowTextSchema, fresh(narrowDefaults.weekNumber)),
  date: v.optional(narrowTextSchema, fresh(narrowDefaults.date)),
  cell: v.optional(narrowBoxSchema, fresh(narrowDefaults.cell)),
});

const defaults: AppearanceSliceState = { wide: wideDefaults, narrow: narrowDefaults };

// The parts default one by one, so a v7 → v8 migration that writes only `wide` parses without a repair.
export const appearanceSliceSchema = v.object({
  wide: v.optional(wideSchema, fresh(wideDefaults)),
  narrow: v.optional(narrowSchema, fresh(narrowDefaults)),
});

export const appearanceSlice = defineSlice<"appearance", typeof appearanceSliceSchema>(
  "appearance",
  appearanceSliceSchema,
  defaults,
);
