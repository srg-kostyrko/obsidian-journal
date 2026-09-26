// Storage stays permissive: taskRuleSchema (conditions.ts) accepts a condition with an empty
// tags/headings/statuses list, because a stored value that fails its schema is repaired or reset
// wholesale for a slice (see CLAUDE.md), and legacy data can already carry one. This schema is
// stricter and is parsed only by the listing filter's editor, against the in-memory draft, never
// against anything read from or written to a journal or view block config. The checkbox provider's
// own rule-form-schema.ts shares the tag/heading arm shapes with this file (condition-form-schema.ts)
// but assembles its own, narrower variant — the two stay separate at the v.variant() call because
// the checkbox editor must never be able to construct a status condition in the first place, and a
// single shared variant covering all three arms would only be safe by omission there.
import * as v from "valibot";

import { buildConditionFormSchemas, conditionFormErrors } from "./condition-form-schema";

import type { TaskCondition } from "../conditions";

export function buildTaskRuleFormSchema() {
  const schemas = buildConditionFormSchemas();
  const taskConditionFormSchema = v.variant("type", [schemas.tag, schemas.heading, schemas.status]);

  return v.object({
    mode: v.picklist(["and", "or"]),
    conditions: v.array(taskConditionFormSchema),
  });
}

export type TaskRuleFormDraft = v.InferInput<ReturnType<typeof buildTaskRuleFormSchema>>;

export function taskRuleConditionErrors(
  draft: TaskRuleFormDraft | { mode: "and" | "or"; conditions: TaskCondition[] },
): ReadonlyMap<number, string> {
  return conditionFormErrors(buildTaskRuleFormSchema(), draft);
}
