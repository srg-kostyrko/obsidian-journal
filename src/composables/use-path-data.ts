import type { JournalNoteData } from "@/types/journal.types";
import { computed, toRef, type ComputedRef, type MaybeRefOrGetter } from "vue";
import { usePlugin } from "./use-plugin";

export function usePathData(path: MaybeRefOrGetter<string>): ComputedRef<JournalNoteData | null> {
  const _path = toRef(path);
  const plugin = usePlugin();

  return computed(() => {
    const path = _path.value;
    if (!path) return null;
    return plugin.index.getForPathComputed(path).value;
  });
}
