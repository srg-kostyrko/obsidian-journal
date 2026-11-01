// Leaf on purpose: journalConfigSchema imports this file, and the tasks module imports journals.
import * as v from "valibot";

import { isUnreadable, orUnreadable, type Unreadable } from "@/settings/repair";

import {
  storedConditionsSchema,
  taskConditionSchema,
  type StoredTaskCondition,
  type TaskCondition,
} from "../../conditions";
import { visibilityRuleSchema } from "../../visibility-rule/rule";

import type { StoredVisibilityRule } from "../../visibility-rule/rule";

export { taskConditionSchema as checkboxConditionSchema } from "../../conditions";
export type { StoredTaskCondition as CheckboxCondition } from "../../conditions";

// The checkbox settings UI never offers a status condition — identification always treats one as
// a no-op (see identification.ts) — so the editor and the rule summary work in this narrower
// type. Only storage stays as wide as TaskCondition, since that schema is shared with the
// listing filter.
export type CheckboxEditableCondition = Exclude<StoredTaskCondition, { type: "status" }>;
export function isEditableCondition(condition: StoredTaskCondition): condition is CheckboxEditableCondition {
  return condition.type !== "status";
}

export function isDescribedCondition(
  condition: StoredTaskCondition,
): condition is Exclude<TaskCondition, { type: "status" }> {
  return condition.type === "tag" || condition.type === "heading";
}

const checkboxRuleObjectSchema = v.object({
  mode: v.optional(v.picklist(["and", "or"]), "and"),
  conditions: storedConditionsSchema(taskConditionSchema),
});

// Held whole when unreadable, counting no checkbox a task: the default, no conditions, counts every one.
export const checkboxRuleSchema = orUnreadable(checkboxRuleObjectSchema);

// Identification is owner-scoped and `dated` asker-scoped, so they stay separate fields. Absent is
// All. Each is held whole when it cannot be read, and then counts and dates nothing: provider.ts
// re-parses each journal's rule at read time with no repair, so the schema itself is the whole of
// its repair. An unreadable `dated` is held on its own, so identification survives it.
const checkboxJournalRuleObjectSchema = v.object({
  compose: v.optional(v.picklist(["inherit", "narrow", "replace"]), "inherit"),
  mode: v.optional(v.picklist(["and", "or"]), "and"),
  conditions: storedConditionsSchema(taskConditionSchema),
  dated: v.optional(visibilityRuleSchema),
});

export const checkboxJournalRuleSchema = orUnreadable(checkboxJournalRuleObjectSchema);

export type CheckboxRule = v.InferOutput<typeof checkboxRuleObjectSchema>;
export type StoredCheckboxRule = CheckboxRule | Unreadable;
export type CheckboxJournalRule = v.InferOutput<typeof checkboxJournalRuleObjectSchema>;
export type StoredCheckboxJournalRule = CheckboxJournalRule | Unreadable;

export function datedRuleOf(rule: StoredCheckboxJournalRule | undefined): StoredVisibilityRule | undefined {
  return isUnreadable(rule) ? rule : rule?.dated;
}
