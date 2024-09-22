<script setup lang="ts">
import { today } from "@/calendar";
import CalendarWeek from "@/components/calendar/CalendarWeek.vue";
import type { JournalNoteData } from "@/types/journal.types";
import { computed } from "vue";

const props = defineProps<{
  noteData: JournalNoteData | null;
}>();

const refDate = computed(() => {
  if (!props.noteData) return today().format("YYYY-MM-DD");
  return props.noteData.date;
});
</script>

<template>
  <div>
    <CalendarWeek :ref-date="refDate" />
  </div>
</template>

<style scoped></style>
