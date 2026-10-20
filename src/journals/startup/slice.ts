import * as v from "valibot";

import { defineSlice } from "@/settings";
import { climb } from "@/settings/repair";

const startupOverrideSchema = v.object({
  // An override with no weekdays never applies, so the empty default is inert.
  weekdays: v.optional(v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6))), () => []),
  journalName: v.pipe(v.string(), climb("a default would open another journal on these days")),
});

// `@/commands` depends on `@/journals`, so importing its open-mode schema here would point the
// dependency backwards — defined locally instead.
const openModeSchema = v.picklist(["active", "tab", "split", "window"]);

// `overrides`, `openMode` and `pinned` are optional so a payload stored before each existed parses
// as it is, rather than going through the load repair and logging a reset.
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
