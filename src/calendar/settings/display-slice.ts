import * as v from "valibot";

import { defineSlice } from "@/settings";
import { climb } from "@/settings/repair";

export type WeekPlacement = "none" | "left" | "right";
export type OutsideDays = "automatic" | "interactive" | "inert" | "hidden";
export type MonthRows = "fit" | "six";
export type WeekdayLabel = { type: "pattern"; pattern: string } | { type: "letter" };
export type LabelKind = "day" | "week" | "month" | "quarter" | "year";
export type Labels = Record<LabelKind, string>;
export type OutsideDates = "active" | "inactive" | "blank";

const labelField = v.optional(v.string(), "");

const weekdayLabelSchema = v.variant("type", [
  v.object({ type: v.pipe(v.literal("pattern"), climb("discriminant")), pattern: v.optional(v.string(), "") }),
  v.object({ type: v.pipe(v.literal("letter"), climb("discriminant")) }),
]);

const stockLabels = (): Labels => ({ day: "", week: "", month: "", quarter: "", year: "" });
const stockWeekdayLabel = (): WeekdayLabel => ({ type: "pattern", pattern: "" });

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
  },
);
