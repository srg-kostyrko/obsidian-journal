import { computed, type ComputedRef } from "vue";

import { useService } from "@/infrastructure/di";

import { CycleService } from "../../cycle";
import { FrontmatterService } from "../../frontmatter";
import { NotePathService } from "../../notes/note-path";
import { TimelineService } from "../../timeline";
import { JournalsViewModel } from "../../view-model";

import { findCollidingJournals } from "./colliding-journals";

import type { JournalConfig } from "../../config";

export function useCollidingJournals(): ComputedRef<JournalConfig[][]> {
  const journalsVM = useService(JournalsViewModel);
  const services = {
    cycle: useService(CycleService),
    frontmatter: useService(FrontmatterService),
    paths: useService(NotePathService),
    timeline: useService(TimelineService),
  };
  return computed(() => findCollidingJournals(journalsVM.journals.value, services));
}
