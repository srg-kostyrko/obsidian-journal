// Leaf on purpose: journalConfigSchema imports this file and the tasks module imports journals —
// any further import here closes a cycle. valibot and the repair markers only.
import * as v from "valibot";

import { climb, readOrUnreadable, unreadableList, type Unreadable } from "@/settings/repair";

// Strict: a fence shows an error for a comparator it does not know, and stored settings keep one
// as an unreadable condition (below) — reading it as the other comparator would invert it.
export const taskConditionSchema = v.variant("type", [
  v.object({
    type: v.pipe(v.literal("tag"), climb("discriminant")),
    condition: v.optional(v.picklist(["has", "lacks"]), "has"),
    tags: v.optional(v.array(v.string()), []),
  }),
  v.object({
    type: v.pipe(v.literal("heading"), climb("discriminant")),
    condition: v.optional(v.picklist(["under", "not-under"]), "under"),
    headings: v.optional(v.array(v.string()), []),
  }),
  v.object({
    type: v.pipe(v.literal("status"), climb("discriminant")),
    condition: v.optional(v.picklist(["is", "is-not"]), "is"),
    statuses: v.optional(v.array(v.string()), []),
  }),
]);

export type UnreadableCondition = Unreadable;

// A stored condition this version cannot read matches nothing rather than being dropped: dropping
// one from an `and` rule widens it to whatever the rest admits. The wrapper keeps the stored value
// and is unwrapped on save, so data.json keeps what was there. The settings repair never sees
// inside this list, so the transform is the whole of its repair.
export function storedConditionsSchema<T>(schema: v.GenericSchema<unknown, T>) {
  return v.optional(
    v.pipe(
      v.unknown(),
      v.transform((items): (T | UnreadableCondition)[] =>
        Array.isArray(items) ? items.map((item: unknown) => readOrUnreadable(schema, item)) : unreadableList(items),
      ),
    ),
    [],
  );
}

// Under `and` one unreadable condition fails every item; under `or` only once none readable is left.
export function blockedByUnreadable(rule: {
  readonly mode: "and" | "or";
  readonly conditions: readonly { readonly type: string }[];
}): boolean {
  const unreadable = rule.conditions.filter((condition) => condition.type === "unreadable").length;
  return unreadable > 0 && (rule.mode === "and" || unreadable === rule.conditions.length);
}

export const taskRuleSchema = v.object({
  mode: v.optional(v.picklist(["and", "or"]), "and"),
  conditions: storedConditionsSchema(taskConditionSchema),
});

export type TaskCondition = v.InferOutput<typeof taskConditionSchema>;
export type StoredTaskCondition = TaskCondition | UnreadableCondition;
export type TaskRule = v.InferOutput<typeof taskRuleSchema>;

export const STATUS_ALIASES: Record<string, readonly string[]> = {
  open: ["todo", "in-progress", "on-hold"],
  done: ["done", "cancelled"],
  all: ["todo", "in-progress", "on-hold", "done", "cancelled", "rolled"],
};

export { unreadableSchema as unreadableConditionSchema } from "@/settings/repair";
