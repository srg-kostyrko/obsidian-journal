import * as v from "valibot";

import { defineSlice } from "@/settings";

export const startupSliceSchema = v.object({ journalName: v.string() });

export type StartupSliceState = v.InferOutput<typeof startupSliceSchema>;

export const startupSlice = defineSlice<"startup", typeof startupSliceSchema>("startup", startupSliceSchema, {
  journalName: "",
});
