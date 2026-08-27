import { onMounted, onUnmounted, shallowRef, type ShallowRef } from "vue";

import { useService } from "@/infrastructure/di";
import { NotesService } from "@/infrastructure/host";

export function useDayNotesVersion(): Readonly<ShallowRef<number>> {
  const notes = useService(NotesService);
  const version = shallowRef(0);
  const refresh = (): void => {
    version.value++;
  };

  onMounted(() => {
    const dispose = [
      notes.events.on("created", refresh),
      notes.events.on("deleted", refresh),
      notes.events.on("renamed", refresh),
      notes.events.on("metadata-changed", refresh),
    ];
    onUnmounted(() => {
      for (const off of dispose) off();
    });
  });

  return version;
}
