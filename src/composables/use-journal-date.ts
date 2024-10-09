import type { MomentDate } from "@/types/date.types";
import { computed, toRef, type MaybeRefOrGetter } from "vue";
import { useJournal } from "./use-journal";
import { plugin$ } from "@/stores/obsidian.store";
import type { JournalNoteData } from "@/types/journal.types";

export function useJournalDate(date: MaybeRefOrGetter<MomentDate>, journalName: MaybeRefOrGetter<string>) {
  const _date = toRef(date);
  const _journalName = toRef(journalName);
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
      return plugin$.value.index.get(journal.value.name, anchorDate.value);
    }),
  };
}
