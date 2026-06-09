<script setup lang="ts">
import { computed } from "vue";

import { CalendarDate, periodOfKind, window } from "@/calendar";
import type { MonthPeriod } from "@/calendar";
import NotesMonthView from "@/notes-calendar/ui/NotesMonthView.vue";

import { useViewContext } from "../../../view-context";

import type { BlockInstanceId } from "../../../config";

const props = defineProps<{
  instanceId: BlockInstanceId;
  config: { before: number; after: number; hideWeekends: boolean; weeks: "none" | "left" | "right" };
}>();

const viewContext = useViewContext();

const months = computed<readonly MonthPeriod[]>(() => {
  const focus = periodOfKind("month", CalendarDate.fromAnchor(viewContext.refDate.value)) as MonthPeriod;
  return window(focus, props.config.before, props.config.after);
});
</script>

<template>
  <div class="journal-view-month-calendar" :data-hide-weekends="config.hideWeekends || null">
    <NotesMonthView
      v-for="month of months"
      :key="month.start.toAnchor()"
      :month="month"
      :shelf="viewContext.shelf.value"
      :weeks="config.weeks"
    />
  </div>
</template>

<style scoped>
.journal-view-month-calendar {
  display: flex;
  flex-direction: column;
  gap: var(--size-4-2);
}
</style>
