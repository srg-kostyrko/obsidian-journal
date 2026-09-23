import { match } from "ts-pattern";

import { formatConjunction, formatDisjunction, m } from "@/i18n";

import type { CheckboxCondition, CheckboxJournalRule, CheckboxRule } from "../rule-schema";

function describeCondition(condition: CheckboxCondition): string {
  return match(condition)
    .with({ type: "tag" }, (c) =>
      m.tasks_condition_tag_describe({ condition: c.condition, tags: formatConjunction(c.tags) }),
    )
    .with({ type: "heading" }, (c) =>
      m.tasks_condition_heading_describe({ condition: c.condition, headings: formatConjunction(c.headings) }),
    )
    .exhaustive();
}

// An empty condition list means "no constraint" here — the inverse of a decoration's, where it
// matches nothing — so the empty case gets its own sentence rather than an empty list.
export function describeCheckboxRule(rule: CheckboxRule | CheckboxJournalRule): string {
  if (rule.conditions.length === 0) return m.tasks_rule_summary_any();
  const parts = rule.conditions.map(describeCondition);
  const joined = rule.mode === "or" ? formatDisjunction(parts) : formatConjunction(parts);
  return m.tasks_rule_summary_conditions({ conditions: joined });
}

export function describeJournalRule(rule: CheckboxJournalRule | undefined): string {
  if (!rule || rule.compose === "inherit") return m.tasks_journal_summary_inherit();
  const described = describeCheckboxRule(rule);
  return rule.compose === "narrow"
    ? m.tasks_journal_summary_narrow({ rule: described })
    : m.tasks_journal_summary_replace({ rule: described });
}
