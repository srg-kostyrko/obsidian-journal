import * as v from "valibot";

import { defineSlice } from "@/settings";

export type WeekPlacement = "none" | "left" | "right";

export const calendarDisplaySliceSchema = v.object({
  weekPlacement: v.optional(v.picklist(["none", "left", "right"]), "left"),
  // Off by default: turning it on adds a row to every calendar-timeline block in the vault,
  // and no existing note asked for one.
  timelineNavigation: v.optional(v.boolean(), false),
});

export type CalendarDisplaySliceState = v.InferOutput<typeof calendarDisplaySliceSchema>;

export const calendarDisplaySlice = defineSlice<"calendarDisplay", typeof calendarDisplaySliceSchema>(
  "calendarDisplay",
  calendarDisplaySliceSchema,
  { weekPlacement: "left", timelineNavigation: false },
);
