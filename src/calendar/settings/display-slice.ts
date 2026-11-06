import * as v from "valibot";

import { defineSlice } from "@/settings";

export type WeekPlacement = "none" | "left" | "right";
export type OutsideDays = "automatic" | "interactive" | "inert" | "hidden";
export type MonthRows = "fit" | "six";
export type OutsideDates = "active" | "inactive" | "blank";

export const calendarDisplaySliceSchema = v.object({
  weekPlacement: v.optional(v.picklist(["none", "left", "right"]), "left"),
  // Off by default: turning it on adds a row to every calendar-timeline block in the vault,
  // and no existing note asked for one.
  timelineNavigation: v.optional(v.boolean(), false),
  showHeading: v.optional(v.boolean(), true),
  showWeekdays: v.optional(v.boolean(), true),
  outsideDays: v.optional(v.picklist(["automatic", "interactive", "inert", "hidden"]), "automatic"),
  monthRows: v.optional(v.picklist(["fit", "six"]), "fit"),
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
  },
);
