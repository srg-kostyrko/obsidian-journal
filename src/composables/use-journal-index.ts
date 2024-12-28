import type { JournalIndex } from "@/journals/journal-index";
import type { JournalPlugin } from "@/types/plugin.types";

export function useJournalIndex(plugin: JournalPlugin, journalName: string): JournalIndex {
  return plugin.index.getJournalIndex(journalName);
}
