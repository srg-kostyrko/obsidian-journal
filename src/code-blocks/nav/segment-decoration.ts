import { CalendarDate, type AnchorString, type Period } from "@/calendar";
import type { Option } from "@/infrastructure/result";
import type { JournalConfig, NavBlockSegment } from "@/journals";

import { periodForJournal } from "./period-for-journal";

export interface SegmentDecorationCell {
  readonly period: Period;
  readonly journalNames: readonly string[];
  readonly scopeKind: "fixed" | "interval";
}

export function segmentDecorationCell(
  segment: NavBlockSegment,
  hostJournal: JournalConfig,
  targetJournals: readonly JournalConfig[],
  anchorOf: (name: string, date: CalendarDate) => Option<AnchorString>,
  date: CalendarDate,
  refDate: AnchorString,
): SegmentDecorationCell | null {
  // An unlinked or self segment decorates as the note it lives in — the behavior every
  // shipped default relies on, and the only case where the link says nothing about a target.
  const journals = segment.link === "none" || segment.link === "self" ? [hostJournal] : targetJournals;
  const anchoredTo = segment.link === "none" || segment.link === "self" ? CalendarDate.fromAnchor(refDate) : date;
  const first = journals.at(0);
  if (!first) return null;
  const anchor = anchorOf(first.name, anchoredTo);
  if (anchor.isNone()) return null;
  return {
    period: periodForJournal(first.write, anchor.value),
    journalNames: journals.map((journal) => journal.name),
    scopeKind: first.write.type === "custom" ? "interval" : "fixed",
  };
}
