<script setup lang="ts">
import { computed } from "vue";

import { CalendarDate, periodOfKind, window } from "@/calendar";
import type { WeekPeriod } from "@/calendar";
import NotesWeekView from "@/notes-calendar/ui/NotesWeekView.vue";

import { useViewContext } from "../../../view-context";

import type { BlockInstanceId } from "../../../config";
import type { WeekCalendarConfig } from "../week-calendar-block";

const props = defineProps<{
  instanceId: BlockInstanceId;
  config: WeekCalendarConfig;
}>();

const viewContext = useViewContext();

const weeks = computed<readonly WeekPeriod[]>(() => {
  const focus = periodOfKind("week", CalendarDate.fromAnchor(viewContext.refDate.value)) as WeekPeriod;
  return window(focus, props.config.before, props.config.after);
});
</script>

<template>
  <div class="journal-view-week-calendar" :data-hide-weekends="config.hideWeekends || null">
    <NotesWeekView
      v-for="week of weeks"
      :key="week.start.toAnchor()"
      :week="week"
      :shelf="viewContext.shelf.value"
      :weeks="config.weeks"
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
