<script setup lang="ts">
import { usePeriodWindow } from "@/calendar/ui";
import NotesMonthView from "@/notes-calendar/ui/NotesMonthView.vue";

import { useViewContext } from "../../../view-context";

import type { BlockInstanceId } from "../../../config";
import type { MonthCalendarConfig } from "../month-calendar-block";

const props = defineProps<{
  instanceId: BlockInstanceId;
  config: MonthCalendarConfig;
}>();

const viewContext = useViewContext();

const months = usePeriodWindow(
  "month",
  viewContext.refDate,
  () => props.config.before,
  () => props.config.after,
);
</script>

<template>
  <div class="journal-view-month-calendar">
    <NotesMonthView
      v-for="month of months"
      :key="month.start.toAnchor()"
      :month="month"
      :shelf="viewContext.shelf.value"
      :weeks="config.weeks"
      :hidden-weekdays="config.hiddenWeekdays"
      :show-header="config.showHeading"
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
