// Storage stays permissive: checkboxRuleSchema/checkboxJournalRuleSchema in rule-schema.ts accept
// a condition with an empty tags/headings list, because a stored value that fails its schema is
// repaired or reset wholesale for a slice (see CLAUDE.md), and legacy data can already carry one.
// This schema is stricter and is parsed only by the two settings modals, against the in-memory
// draft, never against anything read from or written to the slice or the journal config.
import * as v from "valibot";

import { m } from "@/i18n";

import type { CheckboxCondition } from "./rule-schema";

// Built inside a function rather than at module scope: initLocale() runs in onload(), so an
// `m.*()` call evaluated at import time would bake in the base locale's message forever.
export function buildCheckboxRuleFormSchema() {
  const checkboxConditionFormSchema = v.variant("type", [
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
  ]);

  return v.object({
    mode: v.picklist(["and", "or"]),
    conditions: v.array(checkboxConditionFormSchema),
  });
}

export type CheckboxRuleFormDraft = v.InferInput<ReturnType<typeof buildCheckboxRuleFormSchema>>;

// Maps each invalid condition's index to its first error message. RuleEditor's model is keyed by
// array position, not by an id, so index is the only handle a caller has to place the message next
// to the right row.
export function checkboxRuleConditionErrors(
  draft: CheckboxRuleFormDraft | { mode: "and" | "or"; conditions: CheckboxCondition[] },
): ReadonlyMap<number, string> {
  const result = v.safeParse(buildCheckboxRuleFormSchema(), draft);
  const errors = new Map<number, string>();
  if (result.success) return errors;
  for (const issue of result.issues) {
    const [first, second] = issue.path ?? [];
    if (first?.key !== "conditions" || typeof second?.key !== "number") continue;
    if (!errors.has(second.key)) errors.set(second.key, issue.message);
  }
  return errors;
}
