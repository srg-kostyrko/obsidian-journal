import { plugin$ } from "@/stores/obsidian.store";
import type { JournalNoteData } from "@/types/journal.types";
import { computed, toRef, type ComputedRef, type MaybeRefOrGetter } from "vue";

export function usePathData(path: MaybeRefOrGetter<string>): ComputedRef<JournalNoteData | null> {
  const _path = toRef(path);

  return computed(() => {
    const path = _path.value;
    if (!path) return null;
    return plugin$.value.index.getForPathComputed(path).value;
  });
}
