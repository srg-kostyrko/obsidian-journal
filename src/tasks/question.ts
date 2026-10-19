// Leaf on purpose: journalConfigSchema reaches this through decorations/config.ts. valibot,
// ./conditions and ./date-choice only.
import * as v from "valibot";

import { taskRuleSchema, type TaskRule } from "./conditions";
import { taskDateChoiceSchema } from "./date-choice";

export const taskQuestionStatuses = ["listing", "open", "done", "all"] as const;

const EMPTY_RULE: TaskRule = { mode: "and", conditions: [] };

// Status is the question here, not a filter row: a stored status row is hand-edited data, stripped
// rather than rejected so it cannot fail the journal's whole decorations field.
const questionFilterSchema = v.pipe(
  taskRuleSchema,
  v.transform((rule): TaskRule => ({ ...rule, conditions: rule.conditions.filter((c) => c.type !== "status") })),
);

export const taskQuestionSchema = v.object({
  quantifier: v.optional(v.fallback(v.picklist(["any", "all", "none"]), "any"), "any"),
  status: v.optional(v.fallback(v.picklist(taskQuestionStatuses), "listing"), "listing"),
  source: v.optional(v.fallback(v.picklist(["note", "notelets", "both"]), "both"), "both"),
  date: v.optional(v.fallback(taskDateChoiceSchema, "scheduled-or-due"), "scheduled-or-due"),
  filter: v.optional(v.fallback(questionFilterSchema, EMPTY_RULE), EMPTY_RULE),
});

export type TaskQuestion = v.InferOutput<typeof taskQuestionSchema>;
