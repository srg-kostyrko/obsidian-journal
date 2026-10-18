import type { JournalDecorationCondition } from "@/decorations";
import type { JournalConfig } from "@/journals/config";

export const conditionTypeOptions: Record<
  JournalConfig["write"]["type"],
  readonly JournalDecorationCondition["type"][]
> = {
  day: ["title", "tag", "property", "has-note", "note-size", "tasks", "date", "weekday", "has-notelet"],
  week: ["title", "tag", "property", "has-note", "note-size", "tasks", "has-notelet"],
  month: ["title", "tag", "property", "has-note", "note-size", "tasks", "has-notelet"],
  quarter: ["title", "tag", "property", "has-note", "note-size", "tasks", "has-notelet"],
  year: ["title", "tag", "property", "has-note", "note-size", "tasks", "has-notelet"],
  custom: ["title", "tag", "property", "has-note", "note-size", "tasks", "offset", "has-notelet"],
};

export const CALENDAR_CONDITION_TYPES: readonly JournalDecorationCondition["type"][] = ["date", "weekday"];

// A type may repeat when a second instance can say something the first cannot. The parameterless
// has-note predicate is idempotent; tasks repeats because each instance asks its own question;
// weekday already takes a set of days, and any union or
// intersection of two day sets is re-expressible by editing the first instance's `weekdays`
// array, so a second instance adds no reachable state. has-notelet carries a set the same way.
export const SINGLETON_CONDITION_TYPES: ReadonlySet<JournalDecorationCondition["type"]> = new Set([
  "weekday",
  "has-note",
  "has-notelet",
]);
