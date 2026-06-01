<script setup lang="ts">
import { computed } from "vue";

import { CalendarDate, YearPeriod, type AnchorString, type MonthPeriod } from "@/calendar";
import { NotesMonthView } from "@/notes-calendar";

const props = defineProps<{
  refDate: AnchorString;
  shelf: string | null;
  weeks?: "none" | "left" | "right";
}>();

const months = computed<readonly MonthPeriod[]>(() => {
  const year = YearPeriod.containing(CalendarDate.fromAnchor(props.refDate));
  return [...year.months()];
});
</script>

<template>
  <div class="timeline-calendar-container">
    <div class="timeline-calendar">
      <NotesMonthView
        v-for="month in months"
        :key="month.anchor.toAnchor()"
        :shelf
        :month
        :weeks="weeks"
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
  display: grid;
  gap: var(--gap);
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
</style>
