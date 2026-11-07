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

export const UNCHANGED = "unchanged";
export type Unchanged = typeof UNCHANGED;

// "unchanged" is an explicit value, not an absence: a narrow part's null means "no override", so the
// wide value must be able to say "set nothing" without colliding with it.
const unchangedSchema = v.literal(UNCHANGED);
const highlightTextEntries = {
  color: v.union([colorSchema, unchangedSchema]),
  weight: v.union([weightSchema, unchangedSchema]),
  italic: v.union([v.boolean(), unchangedSchema]),
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

// Only the current week spans a week number, so only it carries a second text group.
const currentWeekEntries = { ...highlightEntries, weekNumberText: v.object(highlightTextEntries) };

const textEntries = {
  size: v.string(),
  weight: v.nullable(weightSchema),
  italic: v.nullable(v.boolean()),
  color: v.nullable(colorSchema),
  case: v.nullable(caseSchema),
};

// Only week numbers sit beside the days in a column of their own, so only they carry a divider.
const weekNumberEntries = {
  ...textEntries,
  divider: v.boolean(),
  dividerColor: colorSchema,
  dividerWidth: pixelsSchema,
};

const boxEntries = {
  padding: pixelsSchema,
  radius: v.string(),
  gap: v.string(),
  // Null is Default, a row height that grows with the calendar's width; no number can say that.
  minHeight: v.nullable(pixelsSchema),
};

type Shape<E extends v.ObjectEntries> = v.InferOutput<v.ObjectSchema<E, undefined>>;

export type HighlightValues = Shape<typeof highlightEntries>;
export type CurrentWeekValues = Shape<typeof currentWeekEntries>;
export type TextValues = Shape<typeof textEntries>;
export type WeekNumberValues = Shape<typeof weekNumberEntries>;
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

// A nested group defaults and overrides as a whole unless it is spread like `text` here and in
// `narrowHighlightPart`; the current week's parts spread `weekNumberText` the same way.
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

function currentWeekPart(defaults: CurrentWeekValues) {
  return v.optional(
    v.object({
      ...withDefaults(currentWeekEntries, defaults),
      text: defaultedPart(highlightTextEntries, defaults.text),
      weekNumberText: defaultedPart(highlightTextEntries, defaults.weekNumberText),
    }),
    fresh(defaults),
  );
}

const narrowCurrentWeekPart = v.optional(
  v.object({
    ...asOverrides(currentWeekEntries),
    text: overriddenPart(highlightTextEntries),
    weekNumberText: overriddenPart(highlightTextEntries),
  }),
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
    text: { color: UNCHANGED, weight: UNCHANGED, italic: UNCHANGED },
    over: false,
    ...overrides,
  };
}

function text(overrides: Partial<TextValues>): TextValues {
  return { size: "inherit", weight: null, italic: null, color: null, case: null, ...overrides };
}

const wideDefaults = {
  today: highlight({ text: { color: theme("text-accent"), weight: UNCHANGED, italic: UNCHANGED } }),
  selected: highlight({ style: "ring", color: theme("interactive-accent"), over: true }),
  active: highlight({
    style: "background",
    color: theme("interactive-accent"),
    text: { color: theme("text-on-accent"), weight: UNCHANGED, italic: UNCHANGED },
  }),
  outside: highlight({ text: { color: theme("text-muted"), weight: UNCHANGED, italic: UNCHANGED } }),
  weekend: highlight({ style: "none" }),
  // Text only, not None: None passes every text value through, so the week number's accent could not be stock.
  currentWeek: {
    ...highlight({}),
    weekNumberText: { color: theme("text-accent"), weight: "bold", italic: UNCHANGED },
  } satisfies CurrentWeekValues,
  heading: text({}),
  // Null, not a copy of the stock: Default is the stock, so an explicit copy would read as a change.
  weekday: text({ size: "0.6em" }),
  weekNumber: {
    ...text({ size: "0.85em" }),
    divider: true,
    dividerColor: theme("background-modifier-border"),
    dividerWidth: 1,
  } satisfies WeekNumberValues,
  date: text({ size: "1.1em" }),
  cell: { padding: 0, radius: "var(--radius-s)", gap: "var(--size-2-1)", minHeight: null },
};

const wideSchema = v.object({
  today: highlightPart(wideDefaults.today),
  selected: highlightPart(wideDefaults.selected),
  active: highlightPart(wideDefaults.active),
  outside: highlightPart(wideDefaults.outside),
  weekend: highlightPart(wideDefaults.weekend),
  currentWeek: currentWeekPart(wideDefaults.currentWeek),
  heading: defaultedPart(textEntries, wideDefaults.heading),
  weekday: defaultedPart(textEntries, wideDefaults.weekday),
  weekNumber: defaultedPart(weekNumberEntries, wideDefaults.weekNumber),
  date: defaultedPart(textEntries, wideDefaults.date),
  cell: defaultedPart(boxEntries, wideDefaults.cell),
});

const narrowSchema = v.object({
  today: narrowHighlightPart,
  selected: narrowHighlightPart,
  active: narrowHighlightPart,
  outside: narrowHighlightPart,
  weekend: narrowHighlightPart,
  currentWeek: narrowCurrentWeekPart,
  heading: overriddenPart(textEntries),
  weekday: overriddenPart(textEntries),
  weekNumber: overriddenPart(weekNumberEntries),
  date: overriddenPart(textEntries),
  cell: overriddenPart(boxEntries),
});

export type AppearanceParts = v.InferOutput<typeof wideSchema>;
export type NarrowOverrides = v.InferOutput<typeof narrowSchema>;
export type NarrowHighlight = NarrowOverrides["today"];
export type NarrowCurrentWeek = NarrowOverrides["currentWeek"];

const narrowDefaults: NarrowOverrides = v.parse(narrowSchema, {});

// The parts default one by one, so a v7 → v8 migration that writes only `wide` parses without a repair.
export const appearanceSliceSchema = v.object({
  wide: v.optional(wideSchema, fresh(wideDefaults)),
  narrow: v.optional(narrowSchema, fresh(narrowDefaults)),
});

export type AppearanceSliceState = v.InferOutput<typeof appearanceSliceSchema>;

/** The shortest row a date fits in: narrow's stock row height, and the floor a wide row grows from. */
export const ROW_FLOOR_PX = 26;

/** A leaf left out keeps its narrow null; a group recurses, since a group is never null itself. */
export type DeepPartialNonNull<T> = {
  readonly [K in keyof T]?: null extends T[K]
    ? NonNullable<T[K]>
    : T[K] extends object
      ? DeepPartialNonNull<T[K]>
      : T[K];
};

export type StockNarrow = { readonly [P in keyof NarrowOverrides]?: DeepPartialNonNull<NarrowOverrides[P]> };

/**
 * What narrow shows where the user set nothing at narrow, ahead of their wide value. It lives in code,
 * not in `narrow`, so a saved narrow null keeps meaning "no override" and a later stock can still change.
 */
export const STOCK_NARROW: StockNarrow = {
  selected: { style: "background", strength: 20 },
  date: { size: "1em" },
  cell: { gap: "1px", minHeight: ROW_FLOOR_PX },
};

export const appearanceSlice = defineSlice<"appearance", typeof appearanceSliceSchema>(
  "appearance",
  appearanceSliceSchema,
  { wide: wideDefaults, narrow: narrowDefaults },
);
