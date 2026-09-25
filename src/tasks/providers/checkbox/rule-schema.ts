// Leaf on purpose: journalConfigSchema imports this file, and the tasks module imports journals.
import * as v from "valibot";

import { taskConditionSchema } from "../../conditions";

import type { TaskCondition } from "../../conditions";

export { taskConditionSchema as checkboxConditionSchema } from "../../conditions";
export type { TaskCondition as CheckboxCondition } from "../../conditions";

// The checkbox settings UI never offers a status condition — identification always treats one as
// a no-op (see identification.ts) — so the editor and the rule summary work in this narrower
// type. Only storage stays as wide as TaskCondition, since that schema is shared with the
// listing filter.
export type CheckboxEditableCondition = Exclude<TaskCondition, { type: "status" }>;
export function isEditableCondition(condition: TaskCondition): condition is CheckboxEditableCondition {
  return condition.type !== "status";
}

export const checkboxRuleSchema = v.object({
  mode: v.optional(v.fallback(v.picklist(["and", "or"]), "and"), "and"),
  conditions: v.optional(v.array(taskConditionSchema), []),
});

export const checkboxJournalRuleSchema = v.object({
  compose: v.optional(v.fallback(v.picklist(["inherit", "narrow", "replace"]), "inherit"), "inherit"),
  mode: v.optional(v.fallback(v.picklist(["and", "or"]), "and"), "and"),
  conditions: v.optional(v.array(taskConditionSchema), []),
});

export type CheckboxRule = v.InferOutput<typeof checkboxRuleSchema>;
export type CheckboxJournalRule = v.InferOutput<typeof checkboxJournalRuleSchema>;
