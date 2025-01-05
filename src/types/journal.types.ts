import { moment } from "obsidian";
import type { JournalCommand } from "./settings.types";

export type JournalAnchorDate = string & { _journal_anchor_date: true };

export function JournalAnchorDate(date: string): JournalAnchorDate {
  return date as JournalAnchorDate;
}

export interface JournalMetadata {
  journal: string;
  date: JournalAnchorDate;
  end_date?: string;
  index?: number;
}

export interface JournalNoteData {
  title: string;
  path: string;
  journal: string;
  date: JournalAnchorDate;
  tags: string[];
  properties: Record<string, unknown>;
  tasks: { completed: boolean }[];
  end_date?: string;
  index?: number;
}

export interface AnchorDateResolver {
  readonly repeats: number;
  readonly duration: moment.unitOfTime.DurationConstructor;

  resolveForDate(date: string): JournalAnchorDate | null;
  resolveNext(date: string): JournalAnchorDate | null;
  resolvePrevious(date: string): JournalAnchorDate | null;
  resolveDateForCommand(date: string, command: JournalCommand["type"]): string | null;

  resolveStartDate(anchorDate: JournalAnchorDate): string;
  resolveEndDate(anchorDate: JournalAnchorDate): string;
  resolveRelativeDate(anchorDate: JournalAnchorDate): string;

  calculateOffset(date: string): [positive: number, negative: number];
  countRepeats(startDate: string, endDate: string): number;
}
