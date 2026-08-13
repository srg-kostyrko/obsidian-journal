<script setup lang="ts">
import { computed } from "vue";

import { CalendarDate, MonthPeriod, type AnchorString } from "@/calendar";
import { NotesMonthView } from "@/notes-calendar";

const props = defineProps<{
  refDate: AnchorString;
  shelf: string | null;
  weeks?: "none" | "left" | "right";
  hiddenWeekdays?: readonly number[];
}>();

const month = computed(() => MonthPeriod.containing(CalendarDate.fromAnchor(props.refDate)));
</script>

<template>
  <div class="timeline-month">
    <!-- Adjacent-month days stay actionable: a leading/trailing day can open that day's
         note. Quarter/calendar modes render every month as its own full grid, so their
         overflow days are already active elsewhere and get blanked here instead. -->
    <NotesMonthView :shelf :month :weeks="weeks" :hidden-weekdays="hiddenWeekdays" outside-dates="active" />
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
