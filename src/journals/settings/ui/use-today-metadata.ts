import { computed, type ComputedRef } from "vue";

import { CalendarDate } from "@/calendar";
import { useService } from "@/infrastructure/di";
import { FrontmatterService } from "@/journals";
import type { JournalMetadata } from "@/journals";

export function useTodayMetadata(journalName: string): ComputedRef<JournalMetadata | undefined> {
  const frontmatter = useService(FrontmatterService);
  return computed(() => {
    const anchor = CalendarDate.today().toAnchor();
    const result = frontmatter.buildMetadata(journalName, anchor);
    return result.isOk() ? result.value : undefined;
  });
}
