import { onMounted, onUnmounted, shallowRef, type ShallowRef } from "vue";

import { useService } from "@/infrastructure/di";

import { NoteSizeService } from "./internal/note-size-service";

// NoteSizeService is event-based, not Vue-reactive, so a computed that reads it caches its
// first answer forever. Sizes land asynchronously after a note has already rendered, so that
// first answer is often "unknown". Read this ref inside such a computed to re-run it whenever a
// size lands.
export function useNoteSizeVersion(): Readonly<ShallowRef<number>> {
  const size = useService(NoteSizeService);
  const version = shallowRef(0);
  onMounted(() => {
    const off = size.events.on("size-changed", () => {
      version.value++;
    });
    onUnmounted(off);
  });
  return version;
}
