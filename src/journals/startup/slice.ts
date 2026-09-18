import * as v from "valibot";

import { defineSlice } from "@/settings";

const startupOverrideSchema = v.object({
  weekdays: v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6))),
  journalName: v.string(),
});

// `@/commands` depends on `@/journals`, so importing its open-mode schema here would point the
// dependency backwards — defined locally instead.
const openModeSchema = v.picklist(["active", "tab", "split", "window"]);

// `overrides`, `openMode` and `pinned` are all optional so a stored payload from before each was
// introduced still parses: a slice has no per-field repair path, and a payload that fails the
// schema resets every startup setting to its default rather than just the missing field.
export const startupSliceSchema = v.object({
  journalName: v.string(),
  overrides: v.optional(v.array(startupOverrideSchema), () => []),
  openMode: v.optional(openModeSchema, "active"),
  pinned: v.optional(v.boolean(), false),
});

export type StartupSliceState = v.InferOutput<typeof startupSliceSchema>;
export type StartupOverride = v.InferOutput<typeof startupOverrideSchema>;

export const startupSlice = defineSlice<"startup", typeof startupSliceSchema>("startup", startupSliceSchema, {
  journalName: "",
  overrides: [],
  openMode: "active",
  pinned: false,
});
