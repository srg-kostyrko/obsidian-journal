import { onMounted, onUnmounted, shallowRef, type ShallowRef } from "vue";

import { useService } from "@/infrastructure/di";

import { TaskIndex } from "./task-index";

// TaskIndex is event-based, not Vue-reactive, so a computed that reads it caches its first
// answer forever — and providers fill it after the first render by construction (the checkbox
// provider publishes as owned notes are walked, so the first paint almost always sees an empty
// index). Read this ref inside such a computed to re-run it whenever a provider publishes.
export function useTasksVersion(): Readonly<ShallowRef<number>> {
  const index = useService(TaskIndex);
  const version = shallowRef(0);
  onMounted(() => {
    const off = index.events.on("changed", () => {
      version.value++;
    });
    onUnmounted(off);
  });
  return version;
}
