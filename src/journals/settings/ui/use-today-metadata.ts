import { computed, type ComputedRef } from "vue";

import { CalendarDate } from "@/calendar";
import { useService } from "@/infrastructure/di";
import { FrontmatterService } from "@/journals";
import type { JournalMetadata } from "@/journals";

import { CycleService } from "../../cycle";

export function useTodayMetadata(journalName: string): ComputedRef<JournalMetadata | undefined> {
  const cycle = useService(CycleService);
  const frontmatter = useService(FrontmatterService);
  return computed(() => {
    // A raw date is not the period's identity: for anything but a day journal it
    // resolves numbering and stored end dates differently from the real note path.
    const anchor = cycle.anchorOf(journalName, CalendarDate.today());
    if (anchor.isNone()) return;
    const result = frontmatter.buildMetadata(journalName, anchor.value);
    return result.isOk() ? result.value : undefined;
  });
}
