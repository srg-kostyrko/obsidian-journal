import type { JournalCommand } from "./settings.types";

export type JournalAnchorDate = string & { _journal_anchor_date: true };

export function JournalAnchorDate(date: string): JournalAnchorDate {
  return date as JournalAnchorDate;
}

export interface JournalMetadata {
  id: string;
  date: JournalAnchorDate;
  end_date?: string;
  index?: number;
  path?: string;
}

export interface AnchorDateResolver {
  resolveForDate(date: string): JournalAnchorDate | null;
  resolveNext(date: string): JournalAnchorDate | null;
  resolvePrevious(date: string): JournalAnchorDate | null;
  resolveDateForCommand(date: string, command: JournalCommand["type"]): string | null;

  resolveStartDate(anchorDate: JournalAnchorDate): string;
  resolveEndDate(anchorDate: JournalAnchorDate): string;

  countRepeats(startDate: string, endDate: string): number;
}
