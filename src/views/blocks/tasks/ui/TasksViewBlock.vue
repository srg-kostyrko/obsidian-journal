<script setup lang="ts">
import { computed } from "vue";

import { useShelfScope } from "@/notes-calendar/use-shelf-scope";
import type { TaskListingRequest } from "@/tasks/listing";
import TaskList from "@/tasks/ui/TaskList.vue";
import { useTaskListing } from "@/tasks/ui/use-task-listing";

import { useViewContext } from "../../../view-context";
import { resolveWindow } from "../../custom-intervals/window-resolution";

import type { BlockInstanceId } from "../../../config";
import type { TasksViewBlockConfig } from "../tasks-view-block";

const props = defineProps<{ instanceId: BlockInstanceId; config: TasksViewBlockConfig }>();

const context = useViewContext();
// A view has an explicit shelf selector, unlike the journal-tasks fence: the fence has no view
// context, so it derives scope from its host note's own journal via taskRollupScope. Forcing that
// primitive here would ignore the shelf the user actually picked for this view — the two surfaces
// answer the same-sounding "which journals" question from different inputs on purpose (see
// taskRollupScope's own comment, and CLAUDE.md's matching nav-consumer ruling).
const scope = useShelfScope(() => context.shelf.value);

const scopedJournals = computed(() => {
  const filter = props.config.journals;
  const names = scope.all.value;
  return filter === undefined || filter.length === 0 ? names : names.filter((name) => filter.includes(name));
});

const resolvedWindow = computed(() => resolveWindow(props.config.window, context.refDate.value));

const request = computed<TaskListingRequest | null>(() => {
  const journalNames = scopedJournals.value;
  if (journalNames.length === 0) return null;
  return {
    kind: "window",
    journalNames,
    window: { start: resolvedWindow.value.start, end: resolvedWindow.value.end },
    // scope.depth (literal/rollup) rides along in the stored query but is never read here: a
    // window request already walks every journal in scope directly (see targetPeriods' window
    // branch in listing.ts) — there is no narrower "just the host" state to be literal about, and
    // nothing wider beyond the configured scope for rollup to reach into.
    query: { scope: props.config.scope, filter: props.config.filter, sort: props.config.sort },
  };
});

const listing = useTaskListing(() => request.value);
</script>

<template>
  <TaskList :rows="listing.rows.value" />
</template>
