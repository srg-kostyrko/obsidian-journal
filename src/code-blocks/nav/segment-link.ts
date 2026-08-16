import { CalendarDate, type AnchorString } from "@/calendar";
import type { Option } from "@/infrastructure/result";
import type { JournalConfig, JournalEntry, NavBlockSegment } from "@/journals";
import { applyModifiers, parseModifiers } from "@/templates";

import { resolveLinkTarget, type LinkTarget } from "./link-targets";

export interface ResolvedSegmentLink {
  readonly target: LinkTarget;
  readonly date: CalendarDate;
  // Whether linkDate carried modifiers that actually shifted the date. A shifted `self`
  // opens (and must decorate) at that shifted date rather than the host's own period.
  readonly shifted: boolean;
}

export function resolveSegmentLink(
  segment: NavBlockSegment,
  noteJournal: JournalConfig,
  shelfJournals: readonly JournalConfig[],
  noteEntry: Option<JournalEntry>,
  refDate: AnchorString,
): ResolvedSegmentLink {
  const modifiers = parseModifiers(segment.linkDate) ?? [];
  const date = applyModifiers(CalendarDate.fromAnchor(refDate), modifiers);
  const base = resolveLinkTarget(segment, noteJournal, shelfJournals, noteEntry);
  const shifted = modifiers.length > 0;
  if (segment.link === "self" && shifted) {
    return { target: { kind: "open", journalNames: [noteJournal.name] }, date, shifted };
  }
  return { target: base, date, shifted };
}
