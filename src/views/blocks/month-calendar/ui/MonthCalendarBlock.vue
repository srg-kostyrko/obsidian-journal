<script setup lang="ts">
import { computed } from "vue";

import { CalendarDate, MonthPeriod } from "@/calendar";
import NotesMonthView from "@/notes-calendar/ui/NotesMonthView.vue";

import { useViewContext } from "../../../view-context";

import type { BlockInstanceId } from "../../../config";

const props = defineProps<{
  instanceId: BlockInstanceId;
  config: { before: number; after: number; hideWeekends: boolean };
}>();

const viewContext = useViewContext();

const months = computed<readonly MonthPeriod[]>(() => {
  const focus = MonthPeriod.containing(CalendarDate.fromAnchor(viewContext.refDate.value));
  let cursor = focus;
  for (let i = 0; i < props.config.before; i += 1) cursor = cursor.previous();
  const out: MonthPeriod[] = [];
  for (let i = 0; i < props.config.before + props.config.after + 1; i += 1) {
    out.push(cursor);
    cursor = cursor.next();
  }
  return out;
});
</script>

<template>
  <div class="journal-view-month-calendar" :data-hide-weekends="config.hideWeekends || null">
    <NotesMonthView
      v-for="month of months"
      :key="month.start.toAnchor()"
      :month="month"
      :shelf="viewContext.shelf.value"
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
