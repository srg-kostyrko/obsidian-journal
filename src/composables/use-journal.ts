import type { Journal } from "@/journals/journal";
import { computed, toRef, type ComputedRef, type MaybeRefOrGetter } from "vue";
import type { JournalPlugin } from "@/types/plugin.types";

export function useJournal(
  plugin: JournalPlugin,
  journalName: MaybeRefOrGetter<string>,
): ComputedRef<Journal | undefined> {
  const _journalName = toRef(journalName);
  return computed(() => {
    return plugin.getJournal(_journalName.value);
  });
}
