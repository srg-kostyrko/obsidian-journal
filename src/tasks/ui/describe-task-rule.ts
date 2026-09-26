import { match } from "ts-pattern";

import { formatConjunction, formatDisjunction, m } from "@/i18n";

import { statusFilterLabel } from "./status-filter-options";

import type { TaskCondition, TaskRule } from "../conditions";

// Describes the listing filter — which tasks a listing shows — as opposed to describe-rule.ts's
// describeCheckboxRule, which describes an identification rule — what counts as a task in the
// first place. The two read from the same TaskCondition union but can never share a summary: an
// identification rule never carries a status condition (rule-schema.ts), so its wording is always
// about "checkbox items", while the filter's status condition is the whole reason this function
// exists. Tag and heading share their per-condition phrasing with describe-rule.ts's own messages
// (tasks_condition_tag_describe, tasks_condition_heading_describe) — those are worded about the
// condition alone, not about what it counts toward, so they carry over unchanged.
function describeCondition(condition: TaskCondition): string {
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

// An empty condition list means "no constraint" — every caller with a more specific "no filter of
// its own" story (JournalTaskFilterRow's row, when the journal has none) checks
// `conditions.length === 0` itself before ever calling this, so this only has to answer for a
// filter that genuinely has no conditions of its own to describe.
export function describeTaskRule(rule: TaskRule): string {
  if (rule.conditions.length === 0) return m.tasks_filter_summary_any();
  const parts = rule.conditions.map(describeCondition);
  const joined = rule.mode === "or" ? formatDisjunction(parts) : formatConjunction(parts);
  return m.tasks_filter_summary_conditions({ conditions: joined });
}
