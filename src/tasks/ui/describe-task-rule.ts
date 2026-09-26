import { match } from "ts-pattern";

import { formatConjunction, formatDisjunction, m } from "@/i18n";

import { describeTagOrHeadingCondition } from "./describe-condition";
import { statusFilterLabel } from "./status-filter-options";

import type { TaskCondition, TaskRule } from "../conditions";

// Describes the listing filter — which tasks a listing shows — as opposed to describe-rule.ts's
// describeCheckboxRule, which describes an identification rule — what counts as a task in the
// first place. The two read from the same TaskCondition union but can never share a summary: an
// identification rule never carries a status condition (rule-schema.ts), so its wording is always
// about "checkbox items", while the filter's status condition is the whole reason this function
// exists. Tag and heading share their per-condition phrasing with describe-rule.ts's own messages
// through describeTagOrHeadingCondition (describe-condition.ts) — those are worded about the
// condition alone, not about what it counts toward, so they carry over unchanged.
function describeCondition(condition: TaskCondition): string {
  return match(condition)
    .with({ type: "tag" }, describeTagOrHeadingCondition)
    .with({ type: "heading" }, describeTagOrHeadingCondition)
    .with({ type: "status" }, (c) =>
      c.statuses.length === 0
        ? m.tasks_condition_status_describe_empty()
        : m.tasks_condition_status_describe({
            condition: c.condition,
            statuses: formatConjunction(c.statuses.map(statusFilterLabel)),
          }),
    )
    .exhaustive();
}

// Every production caller either guards an empty condition list itself before calling
// (JournalTaskFilterRow, when the journal has none) or never produces one — TasksViewBlockConfig
// always passes composeFilters' result (filter.ts), which appends a status condition whenever the
// merged filter lacks one and so never returns an empty list. So this never has to state "no
// conditions" on its own; a rule with none is not a shape either caller can hand it.
export function describeTaskRule(rule: TaskRule): string {
  const parts = rule.conditions.map(describeCondition);
  const joined = rule.mode === "or" ? formatDisjunction(parts) : formatConjunction(parts);
  return m.tasks_filter_summary_conditions({ conditions: joined });
}
