import type { JournalDecorationCondition } from "@/decorations";
import type { JournalConfig } from "@/journals/config";

export const conditionTypeOptions: Record<
  JournalConfig["write"]["type"],
  readonly JournalDecorationCondition["type"][]
> = {
  day: [
    "title",
    "tag",
    "property",
    "has-note",
    "note-size",
    "has-open-task",
    "all-tasks-completed",
    "date",
    "weekday",
    "has-notelet",
  ],
  week: ["title", "tag", "property", "has-note", "note-size", "has-open-task", "all-tasks-completed", "has-notelet"],
  month: ["title", "tag", "property", "has-note", "note-size", "has-open-task", "all-tasks-completed", "has-notelet"],
  quarter: ["title", "tag", "property", "has-note", "note-size", "has-open-task", "all-tasks-completed", "has-notelet"],
  year: ["title", "tag", "property", "has-note", "note-size", "has-open-task", "all-tasks-completed", "has-notelet"],
  custom: [
    "title",
    "tag",
    "property",
    "has-note",
    "note-size",
    "has-open-task",
    "all-tasks-completed",
    "offset",
    "has-notelet",
  ],
};

export const CALENDAR_CONDITION_TYPES: readonly JournalDecorationCondition["type"][] = ["date", "weekday"];

// A type may repeat when a second instance can say something the first cannot. The three
// parameterless predicates are idempotent; weekday already takes a set of days, and any union or
// intersection of two day sets is re-expressible by editing the first instance's `weekdays`
// array, so a second instance adds no reachable state. has-notelet carries a set the same way.
export const SINGLETON_CONDITION_TYPES: ReadonlySet<JournalDecorationCondition["type"]> = new Set([
  "weekday",
  "has-note",
  "has-open-task",
  "all-tasks-completed",
  "has-notelet",
]);
