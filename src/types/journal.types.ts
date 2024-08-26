import type { JournalCommand } from "./settings.types";

export interface JournalMetadata {
  id: string;
  start_date: string;
  end_date: string;
  index?: number;
  path?: string;
}

export interface JournalInterval {
  key: string;
  start_date: string;
  end_date: string;
}

export interface IntervalResolver {
  resolveForDate(date: string): JournalInterval | null;
  resolveNext(date: string): JournalInterval | null;
  resolvePrevious(date: string): JournalInterval | null;
  resolveDateForCommand(date: string, command: JournalCommand["type"]): string | null;

  countRepeats(startDate: string, endDate: string): number;
}
