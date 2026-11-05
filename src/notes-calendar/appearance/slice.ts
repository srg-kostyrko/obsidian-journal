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
const highlightTextEntries = {
  color: v.nullable(colorSchema),
  weight: v.nullable(weightSchema),
  italic: v.nullable(v.boolean()),
};

const highlightEntries = {
  // No climb: resetting a corrupt style alone narrows the highlight to its stock style, and
  // resetting the whole part would lose its other values too.
  style: styleSchema,
  color: colorSchema,
  ringWidth: pixelsSchema,
  strength: strengthSchema,
  text: v.object(highlightTextEntries),
  over: v.boolean(),
};

const textEntries = {
  size: v.string(),
  weight: v.nullable(weightSchema),
  italic: v.nullable(v.boolean()),
  color: v.nullable(colorSchema),
  case: v.nullable(caseSchema),
};

const boxEntries = {
  padding: pixelsSchema,
  radius: v.string(),
  gap: v.string(),
  minHeight: pixelsSchema,
};

type Shape<E extends v.ObjectEntries> = v.InferOutput<v.ObjectSchema<E, undefined>>;

export type HighlightValues = Shape<typeof highlightEntries>;
export type TextValues = Shape<typeof textEntries>;
export type BoxValues = Shape<typeof boxEntries>;

export type Overrides<T> = { [K in keyof T]: T[K] | null };

type Defaulted<E extends v.ObjectEntries> = {
  [K in keyof E]: v.OptionalSchema<E[K], () => v.InferInput<E[K]>>;
};

type Overridden<E extends v.ObjectEntries> = {
  [K in keyof E]: v.OptionalSchema<v.NullableSchema<E[K], undefined>, null>;
};

const fresh =
  <T>(value: T) =>
  (): T =>
    structuredClone(value);

/** Each field defaults on its own, so a repair resets only the field that failed. */
function withDefaults<E extends v.ObjectEntries>(entries: E, defaults: Shape<E>): Defaulted<E> {
  const values = new Map<string, unknown>(Object.entries(defaults));
  // Object.fromEntries forgets which schema sits under which key; the mapped type restores it. Typing
  // each default as the entry's input relies on no entry having a transform, so input equals output.
  return Object.fromEntries(
    Object.entries(entries).map(([key, schema]) => [key, v.optional(schema, fresh(values.get(key)))]),
  ) as Defaulted<E>;
}

// A corrupt override repairs to "no override": the wide value still applies, so nothing is lost.
function asOverrides<E extends v.ObjectEntries>(entries: E): Overridden<E> {
  // Object.fromEntries forgets which schema sits under which key; the mapped type restores it.
  return Object.fromEntries(
    Object.entries(entries).map(([key, schema]) => [key, v.optional(v.nullable(schema), null)]),
  ) as Overridden<E>;
}

function defaultedPart<E extends v.ObjectEntries>(entries: E, defaults: Shape<E>) {
  return v.optional(v.object(withDefaults(entries, defaults)), fresh(defaults));
}

function overriddenPart<E extends v.ObjectEntries>(entries: E) {
  const part = v.object(asOverrides(entries));
  // Every override is optional and defaults to null, so an empty object is a whole part with no
  // overrides; TS cannot see through the mapped entries that `{}` is a valid input.
  const empty = {} as v.InferInput<typeof part>;
  return v.optional(part, fresh(empty));
}

// `text` is the only nested group given per-leaf defaults and overrides; a new nested group in
// `highlightEntries` needs the same spread here and in `narrowHighlightPart`, or it defaults and
// overrides as a whole.
function highlightPart(defaults: HighlightValues) {
  return v.optional(
    v.object({
      ...withDefaults(highlightEntries, defaults),
      text: defaultedPart(highlightTextEntries, defaults.text),
    }),
    fresh(defaults),
  );
}

const narrowHighlightPart = v.optional(
  v.object({ ...asOverrides(highlightEntries), text: overriddenPart(highlightTextEntries) }),
  () => ({}),
);

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

const wideDefaults = {
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

const wideSchema = v.object({
  today: highlightPart(wideDefaults.today),
  selected: highlightPart(wideDefaults.selected),
  active: highlightPart(wideDefaults.active),
  outside: highlightPart(wideDefaults.outside),
  heading: defaultedPart(textEntries, wideDefaults.heading),
  weekday: defaultedPart(textEntries, wideDefaults.weekday),
  weekNumber: defaultedPart(textEntries, wideDefaults.weekNumber),
  date: defaultedPart(textEntries, wideDefaults.date),
  cell: defaultedPart(boxEntries, wideDefaults.cell),
});

const narrowSchema = v.object({
  today: narrowHighlightPart,
  selected: narrowHighlightPart,
  active: narrowHighlightPart,
  outside: narrowHighlightPart,
  heading: overriddenPart(textEntries),
  weekday: overriddenPart(textEntries),
  weekNumber: overriddenPart(textEntries),
  date: overriddenPart(textEntries),
  cell: overriddenPart(boxEntries),
});

export type AppearanceParts = v.InferOutput<typeof wideSchema>;
export type NarrowOverrides = v.InferOutput<typeof narrowSchema>;
export type NarrowHighlight = NarrowOverrides["today"];

const narrowDefaults: NarrowOverrides = v.parse(narrowSchema, {});

// The parts default one by one, so a v7 → v8 migration that writes only `wide` parses without a repair.
export const appearanceSliceSchema = v.object({
  wide: v.optional(wideSchema, fresh(wideDefaults)),
  narrow: v.optional(narrowSchema, fresh(narrowDefaults)),
});

export type AppearanceSliceState = v.InferOutput<typeof appearanceSliceSchema>;

export const appearanceSlice = defineSlice<"appearance", typeof appearanceSliceSchema>(
  "appearance",
  appearanceSliceSchema,
  { wide: wideDefaults, narrow: narrowDefaults },
);
