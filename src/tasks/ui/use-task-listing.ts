import { ref, shallowRef, watch, type Ref, type ShallowRef } from "vue";

import { useService } from "@/infrastructure/di";
import { NoteStructureService } from "@/infrastructure/host";
import { CycleService, JournalsIndex, JournalsRepository, useIndexVersion } from "@/journals";

import {
  buildTaskListing,
  type TaskListingDependencies,
  type TaskListingRequest,
  type TaskListingRow,
} from "../listing";
import { TaskIndex } from "../task-index";
import { useTasksVersion } from "../use-tasks-version";
import { TaskVisibility } from "../visibility";

export interface UseTaskListingResult {
  readonly rows: Readonly<ShallowRef<readonly TaskListingRow[]>>;
  readonly pending: Readonly<Ref<boolean>>;
}

// request returns null for "not connected to a journal" — the fence and view block both have such
// a state, and there is nothing to build a listing from until it resolves to a real request.
export function useTaskListing(request: () => TaskListingRequest | null): UseTaskListingResult {
  const dependencies: TaskListingDependencies = {
    journals: useService(JournalsRepository),
    index: useService(JournalsIndex),
    cycle: useService(CycleService),
    structure: useService(NoteStructureService),
    tasks: useService(TaskIndex),
    visibility: useService(TaskVisibility),
  };

  // Neither index is Vue-reactive, so both versions ride along as watch sources: a provider
  // publishing, or the index gaining/losing an entry, has to trigger a rebuild even when the
  // request object itself has not changed.
  const indexVersion = useIndexVersion();
  const tasksVersion = useTasksVersion();

  // JournalsRepository needs no such ref: its storage is a SettingsService slice, and those are Vue
  // `reactive`, so reading a journal's config inside a watch source tracks it. What it does need is
  // a source that reads it at all — a journal's listing filter is half of what composeFilters
  // answers with, and each provider's per-journal rule (TaskVisibility) narrows the items; editing
  // either bumps neither version above. The whole `tasks` block rather than the fields read today,
  // so a provider gaining a rule needs no edit here. The serialization does not dedupe: the version
  // shallowRefs make Vue force-trigger this multi-source watch, so any write to one of these
  // journals rebuilds.
  const scopedTaskSettings = (): string => {
    const current = request();
    if (current === null) return "";
    const names = current.kind === "period" ? [current.hostJournal, ...current.journalNames] : current.journalNames;
    return JSON.stringify(names.map((name) => dependencies.journals.get(name).getOrUndefined()?.tasks));
  };

  const rows = shallowRef<readonly TaskListingRow[]>([]);
  const pending = ref(false);
  let token = 0;

  watch(
    [request, indexVersion, tasksVersion, scopedTaskSettings],
    async ([current]) => {
      const mine = ++token;
      if (current === null) {
        rows.value = [];
        pending.value = false;
        return;
      }
      pending.value = true;
      const next = await buildTaskListing(dependencies, current);
      // A slower earlier build must not overwrite a newer one — the guard leaves the previous
      // rows in place until the build that is actually still current finishes.
      if (mine !== token) return;
      rows.value = next;
      pending.value = false;
    },
    { immediate: true },
  );

  return { rows, pending };
}
