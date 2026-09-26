// Leaf on purpose: journalConfigSchema imports this file and the tasks module imports journals —
// any further import here closes a cycle. valibot only.
import * as v from "valibot";

export const taskConditionSchema = v.variant("type", [
  v.object({
    type: v.literal("tag"),
    condition: v.optional(v.fallback(v.picklist(["has", "lacks"]), "has"), "has"),
    tags: v.optional(v.array(v.string()), []),
  }),
  v.object({
    type: v.literal("heading"),
    condition: v.optional(v.fallback(v.picklist(["under", "not-under"]), "under"), "under"),
    headings: v.optional(v.array(v.string()), []),
  }),
  v.object({
    type: v.literal("status"),
    condition: v.optional(v.fallback(v.picklist(["is", "is-not"]), "is"), "is"),
    statuses: v.optional(v.array(v.string()), []),
  }),
]);

export const taskRuleSchema = v.object({
  mode: v.optional(v.fallback(v.picklist(["and", "or"]), "and"), "and"),
  conditions: v.optional(v.array(taskConditionSchema), []),
});

export type TaskCondition = v.InferOutput<typeof taskConditionSchema>;
export type TaskRule = v.InferOutput<typeof taskRuleSchema>;

export const STATUS_ALIASES: Record<string, readonly string[]> = {
  open: ["todo", "in-progress", "on-hold"],
  done: ["done", "cancelled"],
  all: ["todo", "in-progress", "on-hold", "done", "cancelled", "rolled"],
};
