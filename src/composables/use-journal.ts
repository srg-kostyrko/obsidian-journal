import type { Journal } from "@/journals/journal";
import { plugin$ } from "@/stores/obsidian.store";
import { computed, toRef, type ComputedRef, type MaybeRefOrGetter } from "vue";

export function useJournal(journalName: MaybeRefOrGetter<string>): ComputedRef<Journal | undefined> {
  const _journalName = toRef(journalName);
  return computed(() => {
    return plugin$.value.getJournal(_journalName.value);
  });
}
