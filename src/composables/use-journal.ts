import type { Journal } from "@/journals/journal";
import { computed, toRef, type ComputedRef, type MaybeRefOrGetter } from "vue";
import { usePlugin } from "./use-plugin";

export function useJournal(journalName: MaybeRefOrGetter<string>): ComputedRef<Journal | undefined> {
  const plugin = usePlugin();
  const _journalName = toRef(journalName);
  return computed(() => {
    return plugin.getJournal(_journalName.value);
  });
}
