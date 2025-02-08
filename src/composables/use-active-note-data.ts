import type { JournalPlugin } from "@/types/plugin.types";
import { computed } from "vue";

export function useActiveNoteData(plugin: JournalPlugin) {
  return computed(() => {
    if (!plugin.activeNote) return null;
    return plugin.index.getForPathComputed(plugin.activeNote).value;
  });
}
