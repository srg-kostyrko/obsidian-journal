import type { MomentDate } from "@/types/date.types";
import { computed, toRef, type MaybeRefOrGetter } from "vue";
import { useJournal } from "./use-journal";
import type { JournalNoteData } from "@/types/journal.types";
import { usePlugin } from "./use-plugin";

export function useJournalDate(date: MaybeRefOrGetter<MomentDate>, journalName: MaybeRefOrGetter<string>) {
  const _date = toRef(date);
  const _journalName = toRef(journalName);
  const plugin = usePlugin();
  const journal = useJournal(_journalName);
  const anchorDate = computed(() => {
    if (journal.value) {
      return journal.value.resolveAnchorDate(_date.value.format("YYYY-MM-DD"));
    }
    return null;
  });
  return {
    anchorDate,
    noteData: computed<JournalNoteData | null>(() => {
      if (!journal.value) return null;
      if (!anchorDate.value) return null;
      return plugin.index.get(journal.value.name, anchorDate.value);
    }),
  };
}
