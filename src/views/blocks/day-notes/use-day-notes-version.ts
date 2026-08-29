import { onMounted, onUnmounted, shallowRef, type ShallowRef } from "vue";

import { useService } from "@/infrastructure/di";
import { NotesService } from "@/infrastructure/host";
import { JournalsIndex } from "@/journals";

const REFRESH_DEBOUNCE_MS = 100;

export function useDayNotesVersion(): Readonly<ShallowRef<number>> {
  const notes = useService(NotesService);
  // The index feeds the same recompute, and each recompute walks every markdown note in the
  // vault — so it shares the debounce rather than entering through the other door and
  // re-walking once per entry while a boot-time index build or a bulk re-anchor runs.
  const index = useService(JournalsIndex);
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
      index.events.on("entryChanged", refresh),
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
