import { match } from "ts-pattern";

import { formatConjunction, m } from "@/i18n";

import type { TaskCondition } from "../conditions";

export type TagOrHeadingCondition = Extract<TaskCondition, { type: "tag" | "heading" }>;

// Shared by describe-task-rule.ts's filter summary and the checkbox provider's describe-rule.ts:
// both read a tag/heading condition into the same sentence, worded about the condition alone —
// not about what it counts toward — so nothing here differs between "what a listing shows" and
// "what counts as a task".
export function describeTagOrHeadingCondition(condition: TagOrHeadingCondition): string {
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
