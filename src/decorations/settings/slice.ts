import * as v from "valibot";

import { defineSlice } from "@/settings";

import { calendarDecorationSchema } from "../config";

export const decorationsSliceSchema = v.object({
  decorations: v.array(calendarDecorationSchema),
  // Optional with a default, and loosely bounded, because a slice has no per-field repair path:
  // parseSliceValue falls back to the whole defaults object, so a value this schema rejected
  // would take every vault-wide decoration down with it. 0 means unlimited; the degenerate 1 is
  // normalized in capMarks, which is the single authority for the rule.
  maxMarksPerSlot: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 3),
});

export type DecorationsSliceState = v.InferOutput<typeof decorationsSliceSchema>;

export const decorationsSlice = defineSlice<"decorations", typeof decorationsSliceSchema>(
  "decorations",
  decorationsSliceSchema,
  { decorations: [], maxMarksPerSlot: 3 },
);
