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
  <NotesWeekView :ref-date="refDate" :selected-date="refDate" />
</template>

<style scoped></style>
