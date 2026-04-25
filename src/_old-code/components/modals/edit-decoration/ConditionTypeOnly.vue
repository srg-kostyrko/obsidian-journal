<script setup lang="ts">
import type {
  JournalDecorationHasNoteCondition,
  JournalDecorationHasOpenTaskCondition,
  JournalDecorationAllTasksCompletedCondition,
} from "@/types/settings.types";

defineProps<{
  condition:
    | JournalDecorationHasNoteCondition
    | JournalDecorationHasOpenTaskCondition
    | JournalDecorationAllTasksCompletedCondition;
}>();

const descriptions = {
  "has-note": "There is a note connected to date",
  "has-open-task": "There is no completed task in a note connected to date",
  "all-tasks-completed": "All tasks in the note connected to date have been completed",
};
</script>

<template>
  <div>
    {{ descriptions[condition.type] }}
  </div>
</template>
