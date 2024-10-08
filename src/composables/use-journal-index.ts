import type { JournalIndex } from "@/journals/journal-index";
import { plugin$ } from "@/stores/obsidian.store";

export function useJournalIndex(journalName: string): JournalIndex {
  return plugin$.value.index.getJournalIndex(journalName);
}
