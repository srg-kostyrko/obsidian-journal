import type { JournalDecorationCondition } from "@/decorations";
import type { JournalConfig } from "@/journals/config";

export const conditionTypeOptions: Record<
  JournalConfig["write"]["type"],
  readonly JournalDecorationCondition["type"][]
> = {
  day: ["title", "tag", "property", "has-note", "has-open-task", "all-tasks-completed", "date", "weekday"],
  week: ["title", "tag", "property", "has-note", "has-open-task", "all-tasks-completed"],
  month: ["title", "tag", "property", "has-note", "has-open-task", "all-tasks-completed"],
  quarter: ["title", "tag", "property", "has-note", "has-open-task", "all-tasks-completed"],
  year: ["title", "tag", "property", "has-note", "has-open-task", "all-tasks-completed"],
  custom: ["title", "tag", "property", "has-note", "has-open-task", "all-tasks-completed", "offset"],
};
