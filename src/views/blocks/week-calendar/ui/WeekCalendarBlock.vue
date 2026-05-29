<script setup lang="ts">
import { computed } from "vue";

import { CalendarDate, WeekPeriod } from "@/calendar";
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
  const focus = WeekPeriod.containing(CalendarDate.fromAnchor(viewContext.refDate.value));
  let cursor = focus;
  for (let i = 0; i < props.config.before; i += 1) cursor = cursor.previous();
  const out: WeekPeriod[] = [];
  for (let i = 0; i < props.config.before + props.config.after + 1; i += 1) {
    out.push(cursor);
    cursor = cursor.next();
  }
  return out;
});
</script>

<template>
  <div class="journal-view-week-calendar" :data-hide-weekends="config.hideWeekends || null">
    <NotesWeekView v-for="week of weeks" :key="week.start.toAnchor()" :week="week" :shelf="viewContext.shelf.value" />
  </div>
</template>

<style scoped>
.journal-view-week-calendar {
  display: flex;
  flex-direction: column;
  gap: var(--size-4-2);
}
</style>
