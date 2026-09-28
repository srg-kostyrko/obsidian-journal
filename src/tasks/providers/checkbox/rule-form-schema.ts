// Storage stays permissive: checkboxRuleSchema/checkboxJournalRuleSchema in rule-schema.ts accept
// a condition with an empty tags/headings list, because a stored value that fails its schema is
// repaired or reset wholesale for a slice (see CLAUDE.md), and legacy data can already carry one.
// This schema is stricter and is parsed only by the two settings modals, against the in-memory
// draft, never against anything read from or written to the slice or the journal config.
//
// The tag/heading arm shapes come from @/tasks/ui/condition-form-schema, shared with the listing
// filter's task-rule-form-schema.ts. What is NOT shared is the v.variant() call below: it lists
// only `tag` and `heading`, on purpose. The checkbox editor must never be able to construct a
// status condition in the first place (see rule-schema.ts's isEditableCondition). RuleConditionRow's
// type dropdown is the first gate against that, restricted to the same two arms; this variant is a
// second, independent gate for that — a status condition reaching this schema by any path other
// than the UI (a future bug, a hand-built draft) fails validation here instead of silently
// round-tripping. Assembling this variant from the shared three-arm schema instead would make that
// guarantee "safe only by omission" — true only because nothing here currently produces a status
// condition, not because anything would catch one that did — so the arm list stays explicit and
// local to this file rather than imported.
import * as v from "valibot";

import { buildConditionFormSchemas, conditionFormErrors } from "@/tasks/ui/condition-form-schema";

import type { CheckboxCondition } from "./rule-schema";

export function buildCheckboxRuleFormSchema() {
  const schemas = buildConditionFormSchemas();
  const checkboxConditionFormSchema = v.variant("type", [schemas.tag, schemas.heading]);

  return v.object({
    mode: v.picklist(["and", "or"]),
    conditions: v.array(checkboxConditionFormSchema),
  });
}

export type CheckboxRuleFormDraft = v.InferInput<ReturnType<typeof buildCheckboxRuleFormSchema>>;

export function checkboxRuleConditionErrors(
  draft: CheckboxRuleFormDraft | { mode: "and" | "or"; conditions: CheckboxCondition[] },
): ReadonlyMap<number, string> {
  return conditionFormErrors(buildCheckboxRuleFormSchema(), draft);
}
