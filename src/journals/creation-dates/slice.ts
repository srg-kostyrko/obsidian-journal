import * as v from "valibot";

import { userDateFormat, userDateFormatSchema } from "@/calendar";
import { defineSlice } from "@/settings";

export const dayNotesSliceSchema = v.object({
  property: v.optional(v.string(), "created"),
  format: v.optional(userDateFormatSchema, userDateFormat("YYYY-MM-DD")),
});

export type DayNotesSliceState = v.InferOutput<typeof dayNotesSliceSchema>;

export const dayNotesSlice = defineSlice<"dayNotes", typeof dayNotesSliceSchema>("dayNotes", dayNotesSliceSchema, {
  property: "created",
  format: userDateFormat("YYYY-MM-DD"),
});
