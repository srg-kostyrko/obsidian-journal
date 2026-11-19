import * as v from "valibot";

import { defineSlice } from "@/settings";

export const dayNotesSliceSchema = v.object({
  property: v.optional(v.string(), "created"),
  format: v.optional(v.string(), "YYYY-MM-DD"),
});

export type DayNotesSliceState = v.InferOutput<typeof dayNotesSliceSchema>;

export const dayNotesSlice = defineSlice<"dayNotes", typeof dayNotesSliceSchema>("dayNotes", dayNotesSliceSchema, {
  property: "created",
  format: "YYYY-MM-DD",
});
