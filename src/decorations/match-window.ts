import { advance, periodOfKind, type CalendarDate, type Period, type PeriodKind } from "@/calendar";

import type { JournalDecoration, JournalDecorationCondition } from "./config";

// Tuned rather than derived: roughly a season to a few years of wall-clock per unit. "decade"
// is unreachable — periodKindForWrite never returns it — but the record must be total.
export const MATCH_HORIZON: Record<PeriodKind, number> = {
  day: 90,
  week: 26,
  month: 12,
  quarter: 8,
  year: 5,
  decade: 5,
};

export const CUSTOM_MATCH_HORIZON = 20;

export type WindowDirection = "past" | "future";

export function fixedWindow(kind: PeriodKind, today: CalendarDate, direction: WindowDirection): readonly Period[] {
  const horizon = MATCH_HORIZON[kind];
  const anchorPeriod = periodOfKind(kind, today);
  const first = direction === "past" ? advance(anchorPeriod, -(horizon - 1)) : anchorPeriod;
  const out: Period[] = [first];
  for (let i = 1; i < horizon; i += 1) out.push(advance(first, i));
  return out;
}

const NOTE_BASED: ReadonlySet<JournalDecorationCondition["type"]> = new Set([
  "title",
  "tag",
  "property",
  "has-note",
  "has-open-task",
  "all-tasks-completed",
]);

function isNoteBased(c: JournalDecorationCondition): boolean {
  return NOTE_BASED.has(c.type);
}

// Under "and" every condition must hold, so one note-based condition makes the whole rule
// depend on a note existing. Under "or" a single date or weekday condition can fire without
// one, so notes are only required when nothing else can carry the match.
export function needsNotes(decoration: JournalDecoration): boolean {
  const { conditions } = decoration;
  if (conditions.length === 0) return false;
  return decoration.mode === "and" ? conditions.some(isNoteBased) : conditions.every(isNoteBased);
}
