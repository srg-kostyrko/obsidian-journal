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
  };

  // Neither index is Vue-reactive, so both versions ride along as watch sources: a provider
  // publishing, or the index gaining/losing an entry, has to trigger a rebuild even when the
  // request object itself has not changed.
  const indexVersion = useIndexVersion();
  const tasksVersion = useTasksVersion();

  const rows = shallowRef<readonly TaskListingRow[]>([]);
  const pending = ref(false);
  let token = 0;

  watch(
    [request, indexVersion, tasksVersion],
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
