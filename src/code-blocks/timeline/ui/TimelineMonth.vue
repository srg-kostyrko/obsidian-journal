<script setup lang="ts">
import type { AnchorString } from "@/calendar";
import { usePeriodWindow } from "@/calendar/ui";
import { NotesMonthView } from "@/notes-calendar";

const props = defineProps<{
  refDate: AnchorString;
  shelf: string | null;
  weeks?: "none" | "left" | "right";
  hiddenWeekdays?: readonly number[];
  before?: number;
  after?: number;
}>();

const monthPeriods = usePeriodWindow(
  "month",
  () => props.refDate,
  () => props.before ?? 0,
  () => props.after ?? 0,
);
</script>

<template>
  <div class="timeline-month">
    <!-- Adjacent-month days stay actionable: a leading/trailing day can open that day's
         note. Quarter/calendar modes blank them instead. -->
    <NotesMonthView
      v-for="month of monthPeriods"
      :key="month.start.toAnchor()"
      :shelf
      :month
      :weeks="weeks"
      :hidden-weekdays="hiddenWeekdays"
      outside-dates="active"
    />
  </div>
</template>

<style scoped>
.timeline-month {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--size-4-2);
}
.timeline-month > * {
  width: 400px;
}
</style>
