import * as v from "valibot";

import { defineSlice } from "@/settings";

import { calendarDecorationSchema } from "../config";

export const decorationsSliceSchema = v.object({
  decorations: v.array(calendarDecorationSchema),
  // Loosely bounded: 0 means unlimited, and the degenerate 1 is normalized in capMarks, which is
  // the single authority for the rule.
  maxMarksPerSlot: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 3),
});

export type DecorationsSliceState = v.InferOutput<typeof decorationsSliceSchema>;

export const decorationsSlice = defineSlice<"decorations", typeof decorationsSliceSchema>(
  "decorations",
  decorationsSliceSchema,
  { decorations: [], maxMarksPerSlot: 3 },
);
