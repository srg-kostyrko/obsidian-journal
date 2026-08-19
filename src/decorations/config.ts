import * as v from "valibot";

import { m } from "@/i18n";

import { dateConditionSchema } from "./date-condition";

export const colorSchema = v.union([
  v.object({ type: v.literal("transparent") }),
  v.object({ type: v.literal("theme"), name: v.string() }),
  v.object({ type: v.literal("custom"), color: v.string() }),
]);
export type ColorSettings = v.InferOutput<typeof colorSchema>;

export const borderSideSchema = v.object({
  show: v.boolean(),
  width: v.pipe(v.number(), v.minValue(0)),
  color: colorSchema,
  style: v.string(),
});
export type BorderSide = v.InferOutput<typeof borderSideSchema>;

const backgroundStyle = v.object({ type: v.literal("background"), color: colorSchema });
const colorStyle = v.object({ type: v.literal("color"), color: colorSchema });

const borderStyle = v.object({
  type: v.literal("border"),
  border: v.union([v.literal("uniform"), v.literal("different")]),
  left: borderSideSchema,
  right: borderSideSchema,
  top: borderSideSchema,
  bottom: borderSideSchema,
});

const placementX = v.union([v.literal("left"), v.literal("center"), v.literal("right")]);
const placementY = v.union([v.literal("top"), v.literal("middle"), v.literal("bottom")]);

const shapeStyle = v.object({
  type: v.literal("shape"),
  size: v.pipe(v.number(), v.minValue(0)),
  shape: v.union([
    v.literal("square"),
    v.literal("circle"),
    v.literal("triangle-up"),
    v.literal("triangle-down"),
    v.literal("triangle-left"),
    v.literal("triangle-right"),
  ]),
  color: colorSchema,
  placement_x: placementX,
  placement_y: placementY,
});

const cornerStyle = v.object({
  type: v.literal("corner"),
  placement: v.union([
    v.literal("top-left"),
    v.literal("top-right"),
    v.literal("bottom-left"),
    v.literal("bottom-right"),
  ]),
  color: colorSchema,
});

const iconStyle = v.object({
  type: v.literal("icon"),
  icon: v.string(),
  placement_x: placementX,
  placement_y: placementY,
  color: colorSchema,
  size: v.pipe(v.number(), v.minValue(0)),
});

export const decorationStyleSchema = v.union([
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
  value: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

const hasNoteCondition = v.object({ type: v.literal("has-note") });
const hasOpenTaskCondition = v.object({ type: v.literal("has-open-task") });
const allTasksCompletedCondition = v.object({ type: v.literal("all-tasks-completed") });

export const decorationConditionSchema = v.union([
  titleCondition,
  tagCondition,
  propertyCondition,
  dateConditionSchema,
  weekdayCondition,
  offsetCondition,
  hasNoteCondition,
  hasOpenTaskCondition,
  allTasksCompletedCondition,
  noteSizeCondition,
]);
export type JournalDecorationCondition = v.InferOutput<typeof decorationConditionSchema>;

export const calendarConditionSchema = v.union([dateConditionSchema, weekdayCondition]);
export type CalendarDecorationCondition = v.InferOutput<typeof calendarConditionSchema>;

export const calendarDecorationSchema = v.object({
  mode: v.union([v.literal("and"), v.literal("or")]),
  conditions: v.array(calendarConditionSchema),
  styles: v.array(decorationStyleSchema),
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

export const decorationSchema = v.object({
  mode: v.union([v.literal("and"), v.literal("or")]),
  conditions: v.array(decorationConditionSchema),
  styles: v.array(decorationStyleSchema),
});
export type JournalDecoration = v.InferOutput<typeof decorationSchema>;
