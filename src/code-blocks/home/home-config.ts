import * as v from "valibot";

const fixedEntrySchema = v.picklist(["day", "week", "month", "quarter", "year"] as const);

export const homeEntrySchema = v.union([fixedEntrySchema, v.literal("custom")]);

export const homeBlockSchema = v.object({
  show: v.optional(v.array(homeEntrySchema), () => ["day"] as const),
  separator: v.optional(v.string(), " • "),
  scale: v.optional(v.number(), 1),
  shelf: v.optional(v.string()),
});

export type HomeBlockConfig = v.InferOutput<typeof homeBlockSchema>;
export type HomeEntry = v.InferOutput<typeof homeEntrySchema>;
