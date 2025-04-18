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
  const start = refDateMoment.value.clone().startOf("year");
  return Array.from({ length: 12 }).map((_, i) => start.clone().add(i, "month"));
});
</script>

<template>
  <div class="timeline-calendar-container">
    <div class="timeline-calendar">
      <NotesMonthView
        v-for="date in list"
        :key="date.format('YYYY-MM-DD')"
        :ref-date="date.format('YYYY-MM-DD')"
        hide-outside-dates
      />
    </div>
  </div>
</template>

<style scoped>
.timeline-calendar-container {
  container-type: inline-size;
}
.timeline-calendar {
  --gap: var(--size-4-4);
  --line-offset: calc(var(--gap) / 2);
  --line-thickness: 1px;
  --line-color: var(--text-faint);
  display: grid;
  gap: 0 var(--gap);
  grid-template-columns: repeat(1, 1fr);
}
@container (min-width: 420px) {
  .timeline-calendar {
    grid-template-columns: repeat(2, 1fr);
  }
}
@container (min-width: 630px) {
  .timeline-calendar {
    grid-template-columns: repeat(3, 1fr);
  }
}
.timeline-calendar > * {
  position: relative;
}
.timeline-calendar > *::before,
.timeline-calendar > *::after {
  content: "";
  position: absolute;
  background-color: var(--line-color);
  z-index: 1;
}
.timeline-calendar > *::after {
  inline-size: 100%;
  block-size: var(--line-thickness);
  inset-inline-start: 0;
  inset-block-start: calc(var(--line-offset) * -1);
}
.timeline-calendar > *::before {
  inline-size: var(--line-thickness);
  block-size: 100%;
  inset-block-start: 0;
  inset-inline-start: calc(var(--line-offset) * -1);
}
</style>
