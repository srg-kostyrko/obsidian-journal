import { m } from "@/i18n";

// An unscoped calendar shows every journal, so an empty scope means the vault has no journals
// at all — which is what a fresh install looks like. Naming a shelf there points at a concept
// the user has not met yet, and misdiagnoses the situation for the person least able to tell.
export function calendarEmptyMessage(shelf: string | null): string {
  return shelf === null ? m.view_block_calendar_no_journals_yet() : m.view_block_calendar_no_journals();
}
