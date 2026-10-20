import * as v from "valibot";

import { m } from "@/i18n";
import { climb, whole } from "@/settings/repair";
import { taskQuestionSchema } from "@/tasks/question";

import { dateConditionSchema } from "./date-condition";

const discriminant = <const T extends string>(literal: T) =>
  v.pipe(v.literal(literal), climb("a different type is a different setting"));

export const colorSchema = v.variant("type", [
  v.object({ type: discriminant("transparent") }),
  v.object({ type: discriminant("theme"), name: v.pipe(v.string(), climb("a color is its value")) }),
  v.object({ type: discriminant("custom"), color: v.pipe(v.string(), climb("a color is its value")) }),
]);
export type ColorSettings = v.InferOutput<typeof colorSchema>;

// Every slot arrives visible. Under the last-wins cascade a transparent value is a declaration
// that cancels a broader scope's, not an absence, so an invisible default silently switches off
// a vault-wide rule. Theme variables rather than hex so a decoration follows the user's theme.
export const accentFill = (): ColorSettings => ({ type: "theme", name: "interactive-accent" });
export const accentInk = (): ColorSettings => ({ type: "theme", name: "text-accent" });

export const borderSideSchema = v.object({
  show: v.optional(v.boolean(), true),
  width: v.optional(v.pipe(v.number(), v.minValue(0)), 1),
  color: v.optional(colorSchema, accentInk),
  style: v.optional(v.string(), "solid"),
});
export type BorderSide = v.InferOutput<typeof borderSideSchema>;

export const defaultBorderSide = (): BorderSide => ({ show: true, width: 1, color: accentInk(), style: "solid" });

const backgroundStyle = v.object({ type: discriminant("background"), color: v.optional(colorSchema, accentFill) });
const colorStyle = v.object({ type: discriminant("color"), color: v.optional(colorSchema, accentInk) });

const borderSide = v.optional(borderSideSchema, defaultBorderSide);
const borderStyle = v.object({
  type: discriminant("border"),
  border: v.optional(v.union([v.literal("uniform"), v.literal("different")]), "uniform"),
  left: borderSide,
  right: borderSide,
  top: borderSide,
  bottom: borderSide,
});

const placementX = v.union([v.literal("left"), v.literal("center"), v.literal("right")]);
const placementY = v.union([v.literal("top"), v.literal("middle"), v.literal("bottom")]);

const shapeStyle = v.object({
  type: discriminant("shape"),
  size: v.optional(v.pipe(v.number(), v.minValue(0)), 0.4),
  shape: v.optional(
    v.union([
      v.literal("square"),
      v.literal("circle"),
      v.literal("triangle-up"),
      v.literal("triangle-down"),
      v.literal("triangle-left"),
      v.literal("triangle-right"),
    ]),
    "circle",
  ),
  color: v.optional(colorSchema, accentInk),
  placement_x: v.optional(placementX, "center"),
  placement_y: v.optional(placementY, "bottom"),
});

const cornerStyle = v.object({
  type: discriminant("corner"),
  placement: v.optional(
    v.union([v.literal("top-left"), v.literal("top-right"), v.literal("bottom-left"), v.literal("bottom-right")]),
    "top-left",
  ),
  color: v.optional(colorSchema, accentInk),
});

const iconStyle = v.object({
  type: discriminant("icon"),
  // A stored icon name is user data typed into UiIconSuggest, so it stays a free-form string
  // rather than coming from src/ui/icons.ts.
  icon: v.optional(v.string(), "star"),
  placement_x: v.optional(placementX, "center"),
  placement_y: v.optional(placementY, "top"),
  color: v.optional(colorSchema, accentInk),
  size: v.optional(v.pipe(v.number(), v.minValue(0)), 0.5),
});

export const decorationStyleSchema = v.variant("type", [
  backgroundStyle,
  colorStyle,
  borderStyle,
  shapeStyle,
  cornerStyle,
  iconStyle,
]);
export type JournalDecorationStyle = v.InferOutput<typeof decorationStyleSchema>;

export type JournalDecorationBackground = v.InferOutput<typeof backgroundStyle>;
export type JournalDecorationColor = v.InferOutput<typeof colorStyle>;
export type JournalDecorationBorder = v.InferOutput<typeof borderStyle>;
export type JournalDecorationShape = v.InferOutput<typeof shapeStyle>;
export type JournalDecorationCorner = v.InferOutput<typeof cornerStyle>;
export type JournalDecorationIcon = v.InferOutput<typeof iconStyle>;

const stringOps = v.union([v.literal("contains"), v.literal("starts-with"), v.literal("ends-with")]);

const titleCondition = v.object({
  type: v.literal("title"),
  condition: stringOps,
  value: v.string(),
});

const tagCondition = v.object({
  type: v.literal("tag"),
  condition: stringOps,
  value: v.string(),
});

const stringPropertyCondition = v.object({
  type: v.literal("property"),
  name: v.pipe(
    v.string(),
    v.minLength(1, () => m.journal_property_name_required()),
  ),
  valueType: v.literal("text"),
  condition: v.union([
    v.literal("exists"),
    v.literal("does-not-exist"),
    v.literal("eq"),
    v.literal("neq"),
    v.literal("contains"),
    v.literal("does-not-contain"),
    v.literal("starts-with"),
    v.literal("ends-with"),
  ]),
  value: v.string(),
});

const numberPropertyCondition = v.object({
  type: v.literal("property"),
  name: v.pipe(
    v.string(),
    v.minLength(1, () => m.journal_property_name_required()),
  ),
  valueType: v.literal("number"),
  condition: v.union([
    v.literal("exists"),
    v.literal("does-not-exist"),
    v.literal("eq"),
    v.literal("neq"),
    v.literal("lt"),
    v.literal("lte"),
    v.literal("gt"),
    v.literal("gte"),
  ]),
  value: v.number(),
});

const booleanPropertyCondition = v.object({
  type: v.literal("property"),
  name: v.pipe(
    v.string(),
    v.minLength(1, () => m.journal_property_name_required()),
  ),
  valueType: v.literal("checkbox"),
  condition: v.union([v.literal("exists"), v.literal("does-not-exist"), v.literal("is-true"), v.literal("is-false")]),
});

const datePropertyCondition = v.object({
  type: v.literal("property"),
  name: v.pipe(
    v.string(),
    v.minLength(1, () => m.journal_property_name_required()),
  ),
  valueType: v.literal("date"),
  condition: v.union([
    v.literal("exists"),
    v.literal("does-not-exist"),
    v.literal("eq"),
    v.literal("neq"),
    v.literal("lt"),
    v.literal("lte"),
    v.literal("gt"),
    v.literal("gte"),
  ]),
  value: v.string(),
});

const propertyCondition = v.union([
  stringPropertyCondition,
  numberPropertyCondition,
  booleanPropertyCondition,
  datePropertyCondition,
]);

export const filterConditionSchema = v.union([titleCondition, tagCondition, propertyCondition]);
export type FilterCondition = v.InferOutput<typeof filterConditionSchema>;

const weekdayCondition = v.object({
  type: v.literal("weekday"),
  weekdays: v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6))),
});

const offsetCondition = v.object({
  type: v.literal("offset"),
  offset: v.pipe(
    v.number(),
    v.integer(),
    // 0 is unreachable — offsets are 1-based from both ends — but it is accepted rather
    // than rejected, since existing configs carry it.
    v.transform((n) => (n === 0 ? 1 : n)),
  ),
});

const noteSizeCondition = v.object({
  type: v.literal("note-size"),
  unit: v.union([v.literal("words"), v.literal("characters")]),
  condition: v.union([v.literal("lt"), v.literal("lte"), v.literal("gt"), v.literal("gte")]),
  // Strict pipe is safe only because `ConditionNoteSize.vue` (isValidThreshold) is the sole writer and never lets a cleared or fractional value through.
  value: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

const hasNoteCondition = v.object({ type: v.literal("has-note") });
const tasksCondition = v.object({ type: v.literal("tasks"), ...taskQuestionSchema.entries });

const hasNoteletCondition = v.object({
  type: v.literal("has-notelet"),
  // Opaque ids, deliberately unbranded: journals/config.ts imports this module, so importing
  // typeIdSchema back would close a cycle. An empty list means "any type".
  typeIds: v.optional(v.pipe(v.array(v.string()), climb("empty means any type")), () => []),
});

export const decorationConditionSchema = v.union([
  titleCondition,
  tagCondition,
  propertyCondition,
  dateConditionSchema,
  weekdayCondition,
  offsetCondition,
  hasNoteCondition,
  tasksCondition,
  noteSizeCondition,
  hasNoteletCondition,
]);
export type JournalDecorationCondition = v.InferOutput<typeof decorationConditionSchema>;

const decorationMode = v.pipe(v.union([v.literal("and"), v.literal("or")]), climb("and and or mark different days"));

export const calendarConditionSchema = v.union([dateConditionSchema, weekdayCondition]);
export type CalendarDecorationCondition = v.InferOutput<typeof calendarConditionSchema>;

export const calendarDecorationSchema = v.object({
  mode: decorationMode,
  conditions: v.pipe(
    v.array(calendarConditionSchema),
    whole("a decoration missing one condition matches different days"),
  ),
  styles: v.optional(v.array(decorationStyleSchema), () => []),
});
export type CalendarDecoration = v.InferOutput<typeof calendarDecorationSchema>;

export type JournalDecorationTitleCondition = v.InferOutput<typeof titleCondition>;
export type JournalDecorationTagCondition = v.InferOutput<typeof tagCondition>;
export type JournalDecorationStringPropertyCondition = v.InferOutput<typeof stringPropertyCondition>;
export type JournalDecorationNumberPropertyCondition = v.InferOutput<typeof numberPropertyCondition>;
export type JournalDecorationBooleanPropertyCondition = v.InferOutput<typeof booleanPropertyCondition>;
export type JournalDecorationPropertyCondition = v.InferOutput<typeof propertyCondition>;
export type JournalDecorationDateCondition = v.InferOutput<typeof dateConditionSchema>;
export type JournalDecorationWeekdayCondition = v.InferOutput<typeof weekdayCondition>;
export type JournalDecorationOffsetCondition = v.InferOutput<typeof offsetCondition>;
export type JournalDecorationNoteSizeCondition = v.InferOutput<typeof noteSizeCondition>;
export type JournalDecorationTasksCondition = v.InferOutput<typeof tasksCondition>;
export type JournalDecorationHasNoteletCondition = v.InferOutput<typeof hasNoteletCondition>;

export const decorationSchema = v.object({
  mode: decorationMode,
  conditions: v.pipe(
    v.array(decorationConditionSchema),
    whole("a decoration missing one condition matches different days"),
  ),
  styles: v.optional(v.array(decorationStyleSchema), () => []),
});
export type JournalDecoration = v.InferOutput<typeof decorationSchema>;
