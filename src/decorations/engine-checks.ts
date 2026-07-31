import { match, P } from "ts-pattern";

import type { Period } from "@/calendar";
import type { NoteMetadata } from "@/infrastructure/host";
import type { CycleService } from "@/journals";
import type { JournalConfig } from "@/journals/config";

import { matchesDate } from "./date-condition";

import type {
  JournalDecorationDateCondition,
  JournalDecorationOffsetCondition,
  JournalDecorationPropertyCondition,
  JournalDecorationTagCondition,
  JournalDecorationTitleCondition,
  JournalDecorationWeekdayCondition,
} from "./config";

export function checkTitle(condition: JournalDecorationTitleCondition, metadata: NoteMetadata | null): boolean {
  if (!metadata) return false;
  const title = metadata.title.toLowerCase();
  const value = condition.value.toLowerCase();
  return match(condition.condition)
    .with("contains", () => title.includes(value))
    .with("starts-with", () => title.startsWith(value))
    .with("ends-with", () => title.endsWith(value))
    .exhaustive();
}

// Cached tags always carry a leading "#", but people type the bare name. Dropping it from
// both sides makes "starts-with work" match #workout while "#work" keeps working too.
function bareTag(tag: string): string {
  return (tag.startsWith("#") ? tag.slice(1) : tag).toLowerCase();
}

export function checkTag(condition: JournalDecorationTagCondition, metadata: NoteMetadata | null): boolean {
  if (!metadata) return false;
  const value = bareTag(condition.value);
  const tags = metadata.tags.map(bareTag);
  return match(condition.condition)
    .with("contains", () => tags.some((tag) => tag.includes(value)))
    .with("starts-with", () => tags.some((tag) => tag.startsWith(value)))
    .with("ends-with", () => tags.some((tag) => tag.endsWith(value)))
    .exhaustive();
}

export function checkProperty(condition: JournalDecorationPropertyCondition, metadata: NoteMetadata | null): boolean {
  if (!metadata) return false;
  const present = Object.hasOwn(metadata.properties, condition.name);
  if (condition.condition === "exists") return present;
  if (condition.condition === "does-not-exist") return !present;
  if (!present) {
    // An exclusion operator is satisfied when there is no value to violate it: a note
    // lacking the property counts as "not equal to X" and "does not contain X". Positive
    // operators (eq/contains/comparisons) stay false — there is nothing to match.
    return condition.condition === "neq" || condition.condition === "does-not-contain";
  }
  const raw = metadata.properties[condition.name];

  return match(condition)
    .with({ valueType: "text" }, (c) => checkTextProperty(c, raw))
    .with({ valueType: "number" }, (c) => checkNumberProperty(c, raw))
    .with({ valueType: "checkbox" }, (c) => checkBooleanProperty(c, raw))
    .with({ valueType: "date" }, (c) => checkDateProperty(c, raw))
    .exhaustive();
}

function checkTextProperty(
  c: Extract<JournalDecorationPropertyCondition, { valueType: "text" }>,
  raw: unknown,
): boolean {
  const matchOne = (value: string): boolean =>
    match(c.condition)
      .with("eq", () => value === c.value)
      .with("neq", () => value !== c.value)
      .with("contains", () => value.toLowerCase().includes(c.value.toLowerCase()))
      .with("does-not-contain", () => !value.toLowerCase().includes(c.value.toLowerCase()))
      .with("starts-with", () => value.toLowerCase().startsWith(c.value.toLowerCase()))
      .with("ends-with", () => value.toLowerCase().endsWith(c.value.toLowerCase()))
      .with(P.union("exists", "does-not-exist"), () => false)
      .exhaustive();
  if (typeof raw === "string") return matchOne(raw);
  if (Array.isArray(raw)) return raw.some((item) => typeof item === "string" && matchOne(item));
  return false;
}

function checkNumberProperty(
  c: Extract<JournalDecorationPropertyCondition, { valueType: "number" }>,
  raw: unknown,
): boolean {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return false;
  return match(c.condition)
    .with("eq", () => raw === c.value)
    .with("neq", () => raw !== c.value)
    .with("lt", () => raw < c.value)
    .with("lte", () => raw <= c.value)
    .with("gt", () => raw > c.value)
    .with("gte", () => raw >= c.value)
    .with(P.union("exists", "does-not-exist"), () => false)
    .exhaustive();
}

function checkBooleanProperty(
  c: Extract<JournalDecorationPropertyCondition, { valueType: "checkbox" }>,
  raw: unknown,
): boolean {
  if (typeof raw !== "boolean") return false;
  return match(c.condition)
    .with("is-true", () => raw)
    .with("is-false", () => !raw)
    .with(P.union("exists", "does-not-exist"), () => false)
    .exhaustive();
}

function checkDateProperty(
  c: Extract<JournalDecorationPropertyCondition, { valueType: "date" }>,
  raw: unknown,
): boolean {
  // Obsidian stores date properties as ISO strings ("YYYY-MM-DD"[…]); lexicographic order on
  // those strings matches chronological order, so plain string comparison is correct.
  const value = raw instanceof Date ? raw.toISOString().slice(0, 10) : raw;
  if (typeof value !== "string") return false;
  return match(c.condition)
    .with("eq", () => value === c.value)
    .with("neq", () => value !== c.value)
    .with("lt", () => value < c.value)
    .with("lte", () => value <= c.value)
    .with("gt", () => value > c.value)
    .with("gte", () => value >= c.value)
    .with(P.union("exists", "does-not-exist"), () => false)
    .exhaustive();
}

export function checkDate(condition: JournalDecorationDateCondition, period: Period): boolean {
  return matchesDate(condition, period.anchor);
}

export function checkWeekday(condition: JournalDecorationWeekdayCondition, period: Period): boolean {
  if (condition.weekdays.length === 0) return false;
  const weekday = Number(period.anchor.format("d"));
  return condition.weekdays.includes(weekday);
}

export function checkOffset(
  condition: JournalDecorationOffsetCondition,
  period: Period,
  journal: JournalConfig,
  cycle: Pick<CycleService, "offsets">,
): boolean {
  const result = cycle.offsets(journal.name, period.anchor);
  if (result.isNone()) return false;
  const [positive, negative] = result.value;
  if (condition.offset < 0) return negative === condition.offset;
  return positive === condition.offset;
}

export function hasOpenTask(metadata: NoteMetadata): boolean {
  if (metadata.tasks.length === 0) return false;
  return metadata.tasks.some((task) => !task.completed);
}

export function allTasksCompleted(metadata: NoteMetadata): boolean {
  if (metadata.tasks.length === 0) return false;
  return metadata.tasks.every((task) => task.completed);
}
