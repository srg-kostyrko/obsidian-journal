import { computed, onUnmounted, toRef, type MaybeRef } from "vue";
import { usePlugin } from "./use-plugin";
import { today } from "@/calendar";
import { JournalAnchorDate } from "@/types/journal.types";

export function useFakePathData(_journalName: MaybeRef<string>): string {
  const plugin = usePlugin();
  const fakePath = `@fake@/${Date.now()}-${Math.random()}`;
  const journalName = toRef(_journalName);
  const journal = computed(() => plugin.getJournal(journalName.value));

  const date = JournalAnchorDate(today().format("YYYY-MM-DD"));

  plugin.index.registerPathData(fakePath, {
    path: fakePath,
    title: "Fake Note",
    journal: journalName.value,
    date: journal.value?.resolveAnchorDate(date) ?? date,
    tags: [],
    properties: {},
    tasks: [],
  });

  onUnmounted(() => {
    plugin.index.unregisterPathData(fakePath);
  });

  return fakePath;
}
