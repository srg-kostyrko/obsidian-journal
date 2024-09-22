<script setup lang="ts">
import type { JournalNoteData } from "@/types/journal.types";
import CalendarMonth from "@/components/calendar/CalendarMonth.vue";
import CalendarMonthButton from "@/components/calendar/CalendarMonthButton.vue";
import CalendarQuarterButton from "@/components/calendar/CalendarQuarterButton.vue";
import CalendarYearButton from "@/components/calendar/CalendarYearButton.vue";
import { date_from_string, today } from "@/calendar";
import { computed } from "vue";

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
</script>

<template>
  <CalendarMonth :ref-date="refDate">
    <template #header>
      <CalendarMonthButton :date="refDateMoment" />
      <CalendarQuarterButton :date="refDateMoment" />
      <CalendarYearButton :date="refDateMoment" />
    </template>
  </CalendarMonth>
</template>

<style scoped></style>
