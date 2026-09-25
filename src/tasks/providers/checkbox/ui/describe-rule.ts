import { match } from "ts-pattern";

import { formatConjunction, formatDisjunction, m } from "@/i18n";

import { isEditableCondition } from "../rule-schema";

import type { CheckboxEditableCondition, CheckboxJournalRule, CheckboxRule } from "../rule-schema";

// The settings modals block Save on a condition with no values (see rule-form-schema.ts), but a
// rule stored before that guard existed can still carry one, so this has to degrade sanely rather
// than render describe_tag_describe's "tagged {tags}" with an empty {tags} — "tagged ." — forever.
function describeCondition(condition: CheckboxEditableCondition): string {
  return match(condition)
    .with({ type: "tag" }, (c) =>
      c.tags.length === 0
        ? m.tasks_condition_tag_describe_empty()
        : m.tasks_condition_tag_describe({ condition: c.condition, tags: formatConjunction(c.tags) }),
    )
    .with({ type: "heading" }, (c) =>
      c.headings.length === 0
        ? m.tasks_condition_heading_describe_empty()
        : m.tasks_condition_heading_describe({ condition: c.condition, headings: formatConjunction(c.headings) }),
    )
    .exhaustive();
}

// An empty condition list means "no constraint" here — the inverse of a decoration's, where it
// matches nothing — so the empty case gets its own sentence rather than an empty list.
//
// A status condition is filtered out rather than described: the checkbox settings UI never
// creates one (see rule-schema.ts), but the schema is shared with the listing filter and a stored
// rule could carry one anyway. It never affects matching (identification.ts's no-op arm), so
// dropping it from the summary states the true rule.
export function describeCheckboxRule(rule: CheckboxRule | CheckboxJournalRule): string {
  const conditions = rule.conditions.filter(isEditableCondition);
  if (conditions.length === 0) return m.tasks_rule_summary_any();
  const parts = conditions.map(describeCondition);
  const joined = rule.mode === "or" ? formatDisjunction(parts) : formatConjunction(parts);
  return m.tasks_rule_summary_conditions({ conditions: joined });
}

// Empty conditions is a no-op only under narrow — identifies() ANDs the journal rule onto the
// vault one, and an empty rule always evaluates true — so narrow-with-none reads as the vault
// rule applying unchanged. Under replace the vault rule never runs at all, so empty there means
// every checkbox item in this journal's notes is a task, the same fact describeCheckboxRule's
// own empty case states for the vault-wide rule. Wrapping describeCheckboxRule for either compose
// mode's empty case would carry its wording ("No conditions — every checkbox item…") across a
// mode where it is not true (narrow), so both get their own sentence instead.
export function describeJournalRule(rule: CheckboxJournalRule | undefined): string {
  if (!rule || rule.compose === "inherit") return m.tasks_journal_summary_inherit();
  if (rule.conditions.length === 0) {
    return rule.compose === "narrow" ? m.tasks_journal_summary_narrow_empty() : m.tasks_journal_summary_replace_empty();
  }
  const described = describeCheckboxRule(rule);
  return rule.compose === "narrow"
    ? m.tasks_journal_summary_narrow({ rule: described })
    : m.tasks_journal_summary_replace({ rule: described });
}
