import type { JournalIndex } from "@/journals/journal-index";
import { usePlugin } from "./use-plugin";

export function useJournalIndex(journalName: string): JournalIndex {
  return usePlugin().index.getJournalIndex(journalName);
}
