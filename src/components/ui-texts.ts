import type { JournalDecorationCondition } from "@/types/settings.types";

export const decorationConditionTypeLabels: Record<JournalDecorationCondition["type"], string> = {
  title: "Check title",
  tag: "Check tags",
  property: "Check frontmatter property",
  date: "Check date",
  weekday: "Check weekday",
  offset: "Check interval offset",
  "has-note": "Check if note exists",
  "has-open-task": "Check if note has open tasks",
  "all-tasks-completed": "Check if all tasks are completed",
};
