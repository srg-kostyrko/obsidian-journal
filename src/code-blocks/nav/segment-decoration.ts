import { CalendarDate, type AnchorString, type Period } from "@/calendar";
import type { Option } from "@/infrastructure/result";
import type { CycleService, JournalConfig, JournalEntry, NavBlockSegment } from "@/journals";
import type { ShelfConfig } from "@/shelves";

import { resolveLinkCandidates } from "./link-targets";
import { periodForJournal } from "./period-for-journal";
import { resolveSegmentLink } from "./segment-link";

export interface SegmentDecorationCell {
  readonly period: Period;
  readonly journalNames: readonly string[];
  readonly scopeKind: "fixed" | "interval";
}

export function segmentDecorationCell(
  segment: NavBlockSegment,
  hostJournal: JournalConfig,
  sameWriteTypeJournals: readonly JournalConfig[],
  targetJournals: readonly JournalConfig[],
  anchorOf: (name: string, date: CalendarDate) => Option<AnchorString>,
  date: CalendarDate,
  refDate: AnchorString,
  shifted: boolean,
): SegmentDecorationCell | null {
  // Unlinked, and self unless shifted, decorate as every same-write-type journal in
  // scope, at the host period — the pre-existing per-row scope, inherited from v2, and
  // still the shape every shipped default's `link: "self"` segment depends on. A shifted
  // self is a real link against its own journal at the shifted date (see segment-link.ts),
  // so it falls into the target-resolution branch below instead.
  const isHostLike = segment.link === "none" || (segment.link === "self" && !shifted);
  const journals = isHostLike ? sameWriteTypeJournals : targetJournals;
  const anchorJournal = isHostLike ? hostJournal : journals.at(0);
  const anchoredTo = isHostLike ? CalendarDate.fromAnchor(refDate) : date;
  if (!anchorJournal) return null;
  const anchor = anchorOf(anchorJournal.name, anchoredTo);
  if (anchor.isNone()) return null;
  return {
    period: periodForJournal(anchorJournal.write, anchor.value),
    journalNames: journals.map((journal) => journal.name),
    scopeKind: anchorJournal.write.type === "custom" ? "interval" : "fixed",
  };
}

// The shared four-step derivation every renderer of a segment's decoration needs:
// shelf-scoped candidates, the resolved link, its target journals, and the same-write-type
// set for the host-like case. NavigationCodeBlock (registering the union of periods a
// block's segments can resolve to) and NavBlockSegment/CustomIntervalsBlock (resolving one
// segment's own cell) call this identically, so the set of periods a consumer registers and
// the set a segment can ask a scope for never drift apart.
//
// `entry` only disambiguates resolveLinkTarget's "self" branch between opening the note
// directly and opening it through OpenDateFlow — it never changes the resolved journal set
// or date, so it has no effect on the returned cell. Callers with no natural entry (a
// custom-interval segment has no single "note behind this row") can pass Option.none().
export function resolveSegmentDecoration(
  segment: NavBlockSegment,
  hostJournal: JournalConfig,
  journals: readonly JournalConfig[],
  shelves: readonly ShelfConfig[],
  entry: Option<JournalEntry>,
  refDate: AnchorString,
  cycle: Pick<CycleService, "anchorOf">,
): SegmentDecorationCell | null {
  const candidates = resolveLinkCandidates(hostJournal.name, journals, shelves);
  const resolved = resolveSegmentLink(segment, hostJournal, candidates, entry, refDate);
  const byName = new Map(journals.map((journal) => [journal.name, journal] as const));
  const targetJournals =
    resolved.target.kind === "open"
      ? resolved.target.journalNames
          .map((name) => byName.get(name))
          .filter((config): config is JournalConfig => config !== undefined)
      : [];
  const sameWriteTypeJournals = candidates.filter((journal) => journal.write.type === hostJournal.write.type);
  return segmentDecorationCell(
    segment,
    hostJournal,
    sameWriteTypeJournals,
    targetJournals,
    (name, date) => cycle.anchorOf(name, date),
    resolved.date,
    refDate,
    resolved.shifted,
  );
}
