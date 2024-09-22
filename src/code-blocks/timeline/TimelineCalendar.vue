<script setup lang="ts">
import { date_from_string, today } from "@/calendar";
import type { JournalNoteData } from "@/types/journal.types";
import { computed } from "vue";

import CalendarMonth from "@/components/calendar/CalendarMonth.vue";
import CalendarMonthButton from "@/components/calendar/CalendarMonthButton.vue";
import CalendarQuarterButton from "@/components/calendar/CalendarQuarterButton.vue";
import CalendarYearButton from "@/components/calendar/CalendarYearButton.vue";

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
  const start = refDateMoment.value.clone().startOf("year");
  return Array.from({ length: 12 }).map((_, i) => start.clone().add(i, "month"));
});
</script>

<template>
  <div>
    <CalendarMonth v-for="date in list" :key="date.format('YYYY-MM-DD')" :ref-date="date.format('YYYY-MM-DD')">
      <template #header>
        <CalendarMonthButton :date="date" />
        <CalendarQuarterButton :date="date" />
        <CalendarYearButton :date="date" />
      </template>
    </CalendarMonth>
  </div>
</template>

<style scoped></style>
