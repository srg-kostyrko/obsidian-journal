import * as v from "valibot";

export const timelineModes = ["week", "month", "quarter", "calendar"] as const;

const timelineModeSchema = v.picklist(timelineModes);

export const timelineBlockSchema = v.object({
  mode: v.optional(timelineModeSchema),
  shelf: v.optional(v.string()),
  weeks: v.optional(v.picklist(["default", "none", "left", "right"] as const)),
  hiddenWeekdays: v.optional(v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6)))),
});

export type TimelineBlockConfig = v.InferOutput<typeof timelineBlockSchema>;
export type TimelineMode = v.InferOutput<typeof timelineModeSchema>;
