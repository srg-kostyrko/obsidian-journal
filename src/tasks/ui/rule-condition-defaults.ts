import { match } from "ts-pattern";

import type { TaskCondition } from "../conditions";

// One factory covering every TaskCondition arm, shared by RuleEditor's "Add condition" and
// RuleConditionRow's type switch — both need a fresh, empty condition of a caller-chosen type,
// and this is the one place that knows each arm's own default relation (has/under/is).
export function defaultTaskCondition(type: TaskCondition["type"]): TaskCondition {
  return match(type)
    .with("tag", (): TaskCondition => ({ type: "tag", condition: "has", tags: [] }))
    .with("heading", (): TaskCondition => ({ type: "heading", condition: "under", headings: [] }))
    .with("status", (): TaskCondition => ({ type: "status", condition: "is", statuses: [] }))
    .exhaustive();
}
