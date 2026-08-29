import { onMounted, onUnmounted, shallowRef, type ShallowRef } from "vue";

import { useService } from "@/infrastructure/di";
import { NotesService } from "@/infrastructure/host";

const REFRESH_DEBOUNCE_MS = 100;

export function useDayNotesVersion(): Readonly<ShallowRef<number>> {
  const notes = useService(NotesService);
  const version = shallowRef(0);
  const dispose: (() => void)[] = [];
  let refreshTimer: ReturnType<typeof window.setTimeout> | undefined;

  const refresh = (): void => {
    if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      refreshTimer = undefined;
      version.value++;
    }, REFRESH_DEBOUNCE_MS);
  };

  onMounted(() => {
    dispose.push(
      notes.events.on("created", refresh),
      notes.events.on("deleted", refresh),
      notes.events.on("renamed", refresh),
      notes.events.on("metadata-changed", refresh),
    );
  });

  onUnmounted(() => {
    for (const off of dispose) off();
    if (refreshTimer !== undefined) {
      window.clearTimeout(refreshTimer);
      refreshTimer = undefined;
    }
  });

  return version;
}
