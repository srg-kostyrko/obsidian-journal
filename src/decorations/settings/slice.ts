import * as v from "valibot";

import { defineSlice } from "@/settings";

import { calendarDecorationSchema } from "../config";

export const decorationsSliceSchema = v.object({ decorations: v.array(calendarDecorationSchema) });

export type DecorationsSliceState = v.InferOutput<typeof decorationsSliceSchema>;

export const decorationsSlice = defineSlice<"decorations", typeof decorationsSliceSchema>(
  "decorations",
  decorationsSliceSchema,
  { decorations: [] },
);
