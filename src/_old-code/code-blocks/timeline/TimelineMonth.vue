<script setup lang="ts">
import type { JournalNoteData } from "@/types/journal.types";
import { today } from "@/calendar";
import { computed } from "vue";
import NotesMonthView from "@/components/notes-calendar/NotesMonthView.vue";

const { noteData } = defineProps<{
  noteData: JournalNoteData | null;
}>();

const refDate = computed(() => {
  if (!noteData) return today().format("YYYY-MM-DD");
  return noteData.date;
});
</script>

<template>
  <div class="timeline-month">
    <NotesMonthView :ref-date="refDate" />
  </div>
</template>

<style scoped>
.timeline-month {
  display: flex;
  justify-content: center;
}
.timeline-month > * {
  width: 400px;
}
</style>
