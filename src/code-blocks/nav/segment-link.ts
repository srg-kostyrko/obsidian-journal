import { CalendarDate, type AnchorString } from "@/calendar";
import type { Option } from "@/infrastructure/result";
import type { JournalConfig, JournalEntry, NavBlockSegment } from "@/journals";
import { applyModifiers, parseModifiers } from "@/templates";

import { resolveLinkTarget, type LinkTarget } from "./link-targets";

export interface ResolvedSegmentLink {
  readonly target: LinkTarget;
  readonly date: CalendarDate;
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
  if (segment.link === "self" && modifiers.length > 0) {
    return { target: { kind: "open", journalNames: [noteJournal.name] }, date };
  }
  return { target: base, date };
}
