import { match } from "ts-pattern";

import { formatConjunction, formatDisjunction, m } from "@/i18n";

import { blockedByUnreadable, type StoredTaskCondition, type TaskRule } from "../conditions";

import { describeTagOrHeadingCondition } from "./describe-condition";
import { statusFilterLabel } from "./status-filter-options";

// Describes the listing filter — which tasks a listing shows — as opposed to describe-rule.ts's
// describeCheckboxRule, which describes an identification rule — what counts as a task in the
// first place. The two read from the same TaskCondition union but can never share a summary: an
// identification rule never carries a status condition (rule-schema.ts), so its wording is always
// about "checkbox items", while the filter's status condition is the whole reason this function
// exists. Tag and heading share their per-condition phrasing with describe-rule.ts's own messages
// through describeTagOrHeadingCondition (describe-condition.ts) — those are worded about the
// condition alone, not about what it counts toward, so they carry over unchanged.
function describeCondition(condition: StoredTaskCondition): string[] {
  return (
    match(condition)
      .with({ type: "tag" }, (c) => [describeTagOrHeadingCondition(c)])
      .with({ type: "heading" }, (c) => [describeTagOrHeadingCondition(c)])
      .with({ type: "status" }, (c) => [
        c.statuses.length === 0
          ? m.tasks_condition_status_describe_empty()
          : m.tasks_condition_status_describe({
              condition: c.condition,
              statuses: formatConjunction(c.statuses.map(statusFilterLabel)),
            }),
      ])
      // Matches nothing, so under `or` it adds nothing; blockedByUnreadable covers the rest.
      .with({ type: "unreadable" }, () => [])
      .exhaustive()
  );
}

// Every production caller either guards an empty condition list itself before calling
// (JournalTaskFilterRow, when the journal has none) or never produces one — TasksViewBlockConfig
// always passes composeFilters' result (filter.ts), which appends a status condition whenever the
// merged filter lacks one and so never returns an empty list. So this never has to state "no
// conditions" on its own; a rule with none is not a shape either caller can hand it.
export function describeTaskRule(rule: TaskRule): string {
  if (blockedByUnreadable(rule)) return m.tasks_rule_summary_unreadable();
  const parts = rule.conditions.flatMap(describeCondition);
  const joined = rule.mode === "or" ? formatDisjunction(parts) : formatConjunction(parts);
  return m.tasks_filter_summary_conditions({ conditions: joined });
}
