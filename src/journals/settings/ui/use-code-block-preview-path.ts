import { onUnmounted } from "vue";

import { CalendarDate, type AnchorString } from "@/calendar";
import { useService } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { CycleService, JournalsIndex } from "@/journals";

let counter = 0;

export function useCodeBlockPreviewPath(journalName: string): VaultPath {
  const index = useService(JournalsIndex);
  const cycle = useService(CycleService);

  counter += 1;
  const path = `@journal-code-block-preview@${counter}` as VaultPath;
  const today = CalendarDate.today();
  const anchor: AnchorString = cycle.anchorOf(journalName, today).getOr(today.toAnchor());

  // Registered synchronously (not in onMounted): the blocks read the index from a
  // computed, and the index Map is not reactive, so the entry must already exist
  // before the child block components run their own setup.
  index.register({ journalName, anchor, path });

  onUnmounted(() => {
    index.unregister(path);
  });

  return path;
}
