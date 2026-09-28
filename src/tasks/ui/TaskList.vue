<script setup lang="ts">
import { m } from "@/i18n";

import TaskRow from "./TaskRow.vue";

import type { TaskListingRow } from "../listing";

defineProps<{ rows: readonly TaskListingRow[] }>();
</script>

<template>
  <ul v-if="rows.length > 0" class="task-listing" role="list">
    <TaskRow v-for="row in rows" :key="row.key" :row="row" />
  </ul>
  <p v-else class="task-listing__empty">{{ m.tasks_listing_empty() }}</p>
</template>

<style scoped>
.task-listing {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-1);
  margin: 0;
  padding: 0;
  list-style: none;
}
.task-listing__empty {
  margin: 0;
  color: var(--text-muted);
}
</style>
