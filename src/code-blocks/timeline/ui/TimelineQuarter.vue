<script setup lang="ts">
import { computed } from "vue";

import { CalendarDate, QuarterPeriod, type AnchorString, type MonthPeriod } from "@/calendar";
import { NotesMonthView } from "@/notes-calendar";

const props = defineProps<{
  refDate: AnchorString;
  shelf: string | null;
  weeks?: "none" | "left" | "right";
}>();

const months = computed<readonly MonthPeriod[]>(() => {
  const quarter = QuarterPeriod.containing(CalendarDate.fromAnchor(props.refDate));
  return [...quarter.months()];
});
</script>

<template>
  <div class="timeline-quarter-container">
    <div class="timeline-quarter">
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
.timeline-quarter-container {
  container-type: inline-size;
}
.timeline-quarter {
  --gap: var(--size-4-4);
  display: grid;
  gap: var(--gap);
  grid-template-columns: repeat(1, 1fr);
}
@container (min-width: 420px) {
  .timeline-quarter {
    grid-template-columns: repeat(2, 1fr);
  }
}
@container (min-width: 630px) {
  .timeline-quarter {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
