// Storage stays permissive: taskRuleSchema (conditions.ts) accepts a condition with an empty
// tags/headings/statuses list, because a stored value that fails its schema is repaired or reset
// wholesale for a slice (see CLAUDE.md), and legacy data can already carry one. This schema is
// stricter and is parsed only by the listing filter's editor, against the in-memory draft, never
// against anything read from or written to a journal or view block config. The checkbox provider's
// own rule-form-schema.ts is the narrower, tag/heading-only sibling of this — the two stay separate
// because the checkbox editor must never be able to construct a status condition in the first
// place, and a shared schema covering all three arms would only be safe by omission there.
import * as v from "valibot";

import { m } from "@/i18n";

import type { TaskCondition } from "../conditions";

// Built inside a function rather than at module scope: initLocale() runs in onload(), so an
// `m.*()` call evaluated at import time would bake in the base locale's message forever.
export function buildTaskRuleFormSchema() {
  const taskConditionFormSchema = v.variant("type", [
    v.object({
      type: v.literal("tag"),
      condition: v.picklist(["has", "lacks"]),
      tags: v.pipe(v.array(v.string()), v.minLength(1, m.tasks_condition_values_required())),
    }),
    v.object({
      type: v.literal("heading"),
      condition: v.picklist(["under", "not-under"]),
      headings: v.pipe(v.array(v.string()), v.minLength(1, m.tasks_condition_values_required())),
    }),
    v.object({
      type: v.literal("status"),
      condition: v.picklist(["is", "is-not"]),
      statuses: v.pipe(v.array(v.string()), v.minLength(1, m.tasks_condition_values_required())),
    }),
  ]);

  return v.object({
    mode: v.picklist(["and", "or"]),
    conditions: v.array(taskConditionFormSchema),
  });
}

export type TaskRuleFormDraft = v.InferInput<ReturnType<typeof buildTaskRuleFormSchema>>;

// Maps each invalid condition's index to its first error message. RuleEditor's model is keyed by
// array position, not by an id, so index is the only handle a caller has to place the message next
// to the right row.
export function taskRuleConditionErrors(
  draft: TaskRuleFormDraft | { mode: "and" | "or"; conditions: TaskCondition[] },
): ReadonlyMap<number, string> {
  const result = v.safeParse(buildTaskRuleFormSchema(), draft);
  const errors = new Map<number, string>();
  if (result.success) return errors;
  for (const issue of result.issues) {
    const [first, second] = issue.path ?? [];
    if (first?.key !== "conditions" || typeof second?.key !== "number") continue;
    if (!errors.has(second.key)) errors.set(second.key, issue.message);
  }
  return errors;
}
