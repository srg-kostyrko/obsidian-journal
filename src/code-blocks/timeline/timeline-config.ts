import * as v from "valibot";

const timelineModeSchema = v.picklist(["week", "month", "quarter", "calendar"] as const);

export const timelineBlockSchema = v.object({
  mode: v.optional(timelineModeSchema),
  shelf: v.optional(v.string()),
  weeks: v.optional(v.picklist(["none", "left", "right"] as const)),
});

export type TimelineBlockConfig = v.InferOutput<typeof timelineBlockSchema>;
export type TimelineMode = v.InferOutput<typeof timelineModeSchema>;
