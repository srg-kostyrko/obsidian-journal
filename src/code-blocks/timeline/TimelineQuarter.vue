<script setup lang="ts">
import { date_from_string, today } from "@/calendar";
import type { JournalNoteData } from "@/types/journal.types";
import { computed } from "vue";

import NotesMonthView from "@/components/notes-calendar/NotesMonthView.vue";
const props = defineProps<{
  noteData: JournalNoteData | null;
}>();

const refDate = computed(() => {
  if (!props.noteData) return today().format("YYYY-MM-DD");
  return props.noteData.date;
});

const refDateMoment = computed(() => {
  return date_from_string(refDate.value);
});

const list = computed(() => {
  const start = refDateMoment.value.clone().startOf("quarter");
  return [start.clone(), start.clone().add(1, "month"), start.clone().add(2, "month")];
});
</script>

<template>
  <div>
    <NotesMonthView v-for="date in list" :key="date.format('YYYY-MM-DD')" :ref-date="date.format('YYYY-MM-DD')" />
  </div>
</template>

<style scoped></style>
