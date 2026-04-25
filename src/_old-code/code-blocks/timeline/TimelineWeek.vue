<script setup lang="ts">
import { today } from "@/calendar";
import type { JournalNoteData } from "@/types/journal.types";
import { computed } from "vue";
import NotesWeekView from "@/components/notes-calendar/NotesWeekView.vue";

const props = defineProps<{
  noteData: JournalNoteData | null;
}>();

const refDate = computed(() => {
  if (!props.noteData) return today().format("YYYY-MM-DD");
  return props.noteData.date;
});
</script>

<template>
  <div class="timeline-week">
    <NotesWeekView :ref-date="refDate" />
  </div>
</template>

<style scoped>
.timeline-week {
  display: flex;
  justify-content: center;
}
.timeline-week > * {
  width: 400px;
}
</style>
