<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import type { CodeBlockProps } from "@/infrastructure/host";
import { JournalsIndex, JournalsRepository, useIndexVersion } from "@/journals";
import { ShelvesRepository } from "@/shelves";
import type { TaskListingRequest } from "@/tasks/listing";
import TaskList from "@/tasks/ui/TaskList.vue";
import { useTaskListing } from "@/tasks/ui/use-task-listing";

import { resolveLinkCandidates } from "../../nav/link-targets";

import type { TasksFenceConfig } from "../tasks-config";

const { path, config } = defineProps<CodeBlockProps<TasksFenceConfig>>();

const index = useService(JournalsIndex);
const journals = useService(JournalsRepository);
const shelves = useService(ShelvesRepository);
const indexVersion = useIndexVersion();

const host = computed(() => {
  void indexVersion.value;
  const entry = index.entryByPath(path);
  if (entry.isNone()) return null;
  const journal = journals.get(entry.value.journalName);
  return journal.isSome() ? { journalName: entry.value.journalName, anchor: entry.value.anchor } : null;
});

// Rollup widens across the host's shelf scope: the owning shelf's journals, or every journal
// when the host sits on no shelf — the same fallback nav links resolve with
// (`resolveLinkCandidates`). The fence has no key to name a different set on purpose; that
// targeting question belongs to the dashboard's view block, not to a note-scoped fence.
const request = computed<TaskListingRequest | null>(() => {
  const target = host.value;
  if (target === null) return null;
  const journalNames = resolveLinkCandidates(
    target.journalName,
    [...journals.find().list()],
    [...shelves.find().list()],
  ).map((journal) => journal.name);
  return { hostJournal: target.journalName, anchor: target.anchor, journalNames, query: config };
});

const listing = useTaskListing(() => request.value);
</script>

<template>
  <div class="journal-tasks">
    <p v-if="host === null" class="journal-tasks-not-connected">{{ m.code_blocks_tasks_not_connected() }}</p>
    <TaskList v-else :rows="listing.rows.value" />
  </div>
</template>
