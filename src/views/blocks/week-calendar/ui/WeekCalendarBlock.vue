<script setup lang="ts">
import { usePeriodWindow } from "@/calendar/ui";
import NotesWeekView from "@/notes-calendar/ui/NotesWeekView.vue";

import { useViewContext } from "../../../view-context";

import type { BlockInstanceId } from "../../../config";
import type { WeekCalendarConfig } from "../week-calendar-block";

const props = defineProps<{
  instanceId: BlockInstanceId;
  config: WeekCalendarConfig;
}>();

const viewContext = useViewContext();

const weeks = usePeriodWindow(
  "week",
  viewContext.refDate,
  () => props.config.before,
  () => props.config.after,
);
</script>

<template>
  <div class="journal-view-week-calendar">
    <NotesWeekView
      v-for="week of weeks"
      :key="week.start.toAnchor()"
      :week="week"
      :shelf="viewContext.shelf.value"
      :weeks="config.weeks"
      :hidden-weekdays="config.hiddenWeekdays"
    />
  </div>
</template>

<style scoped>
.journal-view-week-calendar {
  display: flex;
  flex-direction: column;
  gap: var(--size-4-2);
}
</style>
