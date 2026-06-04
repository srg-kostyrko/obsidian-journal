import * as v from "valibot";

import { defineSlice } from "@/settings";

export const loggingSliceSchema = v.object({
  level: v.picklist(["debug", "info", "warn", "error"]),
});

export type LoggingSliceState = v.InferOutput<typeof loggingSliceSchema>;

export const loggingSlice = defineSlice<"logging", typeof loggingSliceSchema>("logging", loggingSliceSchema, {
  level: "warn",
});
