import { computed, toRef, type MaybeRefOrGetter } from "vue";
import { useJournal } from "./use-journal";
import type { JournalPlugin } from "@/types/plugin.types";
import type { JournalNoteData } from "@/types/journal.types";

export function useJournalDate(
  plugin: JournalPlugin,
  date: MaybeRefOrGetter<string | null>,
  journalName: MaybeRefOrGetter<string>,
) {
  const _date = toRef(date);
  const _journalName = toRef(journalName);
  const journal = useJournal(plugin, _journalName);
  const anchorDate = computed(() => {
    if (!_date.value) return null;
    if (journal.value) {
      return journal.value.resolveAnchorDate(_date.value);
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
