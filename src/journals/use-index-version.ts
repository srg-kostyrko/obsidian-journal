import { onMounted, onUnmounted, shallowRef, type ShallowRef } from "vue";

import { useService } from "@/infrastructure/di";

import { JournalsIndex } from "./journals-index";

// JournalsIndex is event-based, not Vue-reactive, so a computed that reads it caches its first
// answer forever. Notes are indexed asynchronously — metadataCache resolves after a freshly
// created note has already rendered its code blocks — so that first answer is often "no entry".
// Read this ref inside such a computed to re-run it whenever the index changes.
export function useIndexVersion(): Readonly<ShallowRef<number>> {
  const index = useService(JournalsIndex);
  const version = shallowRef(0);
  onMounted(() => {
    const off = index.events.on("entryChanged", () => {
      version.value++;
    });
    onUnmounted(off);
  });
  return version;
}
