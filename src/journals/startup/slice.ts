import * as v from "valibot";

import { defineSlice } from "@/settings";

const startupOverrideSchema = v.object({
  weekdays: v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6))),
  journalName: v.string(),
});

// `overrides` is optional so a stored `{ journalName }` from before weekday overrides still parses:
// a slice has no per-field repair path, and a payload that fails the schema resets every startup
// setting to its default rather than just the missing field.
export const startupSliceSchema = v.object({
  journalName: v.string(),
  overrides: v.optional(v.array(startupOverrideSchema), () => []),
});

export type StartupSliceState = v.InferOutput<typeof startupSliceSchema>;
export type StartupOverride = v.InferOutput<typeof startupOverrideSchema>;

export const startupSlice = defineSlice<"startup", typeof startupSliceSchema>("startup", startupSliceSchema, {
  journalName: "",
  overrides: [],
});
