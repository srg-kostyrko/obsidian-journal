import * as v from "valibot";

import { defineSlice } from "@/settings";
import { climb, whole } from "@/settings/repair";

import { userDateFormat, userDateFormatSchema, type UserDateFormat } from "../user-date-format";

export type WeekPlacement = "none" | "left" | "right";
export type OutsideDays = "automatic" | "interactive" | "inert" | "hidden";
export type MonthRows = "fit" | "six";
export type WeekdayLabel = { type: "pattern"; pattern: UserDateFormat } | { type: "letter" };
export type LabelKind = "day" | "week" | "month" | "quarter" | "year";
export type Labels = Record<LabelKind, UserDateFormat>;
export type OutsideDates = "active" | "inactive" | "blank";
export type WeekendSetting = { type: "locale" } | { type: "custom"; days: number[] };

const NO_PATTERN = userDateFormat("");

const labelField = v.optional(userDateFormatSchema, NO_PATTERN);

const weekdayLabelSchema = v.variant("type", [
  v.object({
    type: v.pipe(v.literal("pattern"), climb("discriminant")),
    pattern: v.optional(userDateFormatSchema, NO_PATTERN),
  }),
  v.object({ type: v.pipe(v.literal("letter"), climb("discriminant")) }),
]);

const weekendDay = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6));

const weekendSchema = v.variant("type", [
  v.object({ type: v.pipe(v.literal("locale"), climb("discriminant")) }),
  v.object({
    type: v.pipe(v.literal("custom"), climb("discriminant")),
    days: v.pipe(v.array(weekendDay), whole("a custom weekend missing a day is a different weekend")),
  }),
]);

const stockWeekend = (): WeekendSetting => ({ type: "locale" });
const stockLabels = (): Labels => ({
  day: NO_PATTERN,
  week: NO_PATTERN,
  month: NO_PATTERN,
  quarter: NO_PATTERN,
  year: NO_PATTERN,
});
const stockWeekdayLabel = (): WeekdayLabel => ({ type: "pattern", pattern: NO_PATTERN });

export const calendarDisplaySliceSchema = v.object({
  weekPlacement: v.optional(v.picklist(["none", "left", "right"]), "left"),
  // Off by default: turning it on adds a row to every calendar-timeline block in the vault,
  // and no existing note asked for one.
  timelineNavigation: v.optional(v.boolean(), false),
  showHeading: v.optional(v.boolean(), true),
  showWeekdays: v.optional(v.boolean(), true),
  outsideDays: v.optional(v.picklist(["automatic", "interactive", "inert", "hidden"]), "automatic"),
  monthRows: v.optional(v.picklist(["fit", "six"]), "fit"),
  // An empty string is "the default pattern for that period kind".
  labels: v.optional(
    v.object({ day: labelField, week: labelField, month: labelField, quarter: labelField, year: labelField }),
    stockLabels,
  ),
  weekdayLabel: v.optional(weekdayLabelSchema, stockWeekdayLabel),
  // null is "same as the wide label".
  weekdayLabelNarrow: v.optional(v.nullable(weekdayLabelSchema), null),
  weekend: v.optional(weekendSchema, stockWeekend),
});

export type CalendarDisplaySliceState = v.InferOutput<typeof calendarDisplaySliceSchema>;

export const calendarDisplaySlice = defineSlice<"calendarDisplay", typeof calendarDisplaySliceSchema>(
  "calendarDisplay",
  calendarDisplaySliceSchema,
  {
    weekPlacement: "left",
    timelineNavigation: false,
    showHeading: true,
    showWeekdays: true,
    outsideDays: "automatic",
    monthRows: "fit",
    labels: stockLabels(),
    weekdayLabel: stockWeekdayLabel(),
    weekdayLabelNarrow: null,
    weekend: stockWeekend(),
  },
);
