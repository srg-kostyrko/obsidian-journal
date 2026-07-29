<script setup lang="ts">
import { computed } from "vue";

import { useResolvedWeekPlacement } from "@/calendar";
import { usePeriodWindow } from "@/calendar/ui";
import NotesMonthView from "@/notes-calendar/ui/NotesMonthView.vue";

import { useViewContext } from "../../../view-context";
import { monthWindowContains } from "../../ui/follow-visibility";
import { useWindowAnchor } from "../../ui/use-window-anchor";

import type { BlockInstanceId } from "../../../config";
import type { MonthCalendarConfig } from "../month-calendar-block";

const props = defineProps<{
  instanceId: BlockInstanceId;
  config: MonthCalendarConfig;
}>();

const viewContext = useViewContext();

const focus = useWindowAnchor({
  refDate: viewContext.refDate,
  origin: viewContext.refDateOrigin,
  contains: (date, anchor) => monthWindowContains(date, anchor, props.config.before, props.config.after),
});

const months = usePeriodWindow(
  "month",
  focus,
  () => props.config.before,
  () => props.config.after,
);

// A lone month dims its adjacent-month days; a window of several months blanks them so the
// adjacent months' own cells aren't shadowed by dates duplicated across the stack.
const outsideDates = computed<"active" | "blank">(() => (months.value.length > 1 ? "blank" : "active"));

const weekPlacement = useResolvedWeekPlacement(() => props.config.weeks);
</script>

<template>
  <div class="journal-view-month-calendar">
    <NotesMonthView
      v-for="month of months"
      :key="month.start.toAnchor()"
      :month="month"
      :shelf="viewContext.shelf.value"
      :weeks="weekPlacement"
      :hidden-weekdays="config.hiddenWeekdays"
      :show-header="config.showHeading"
      :outside-dates="outsideDates"
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
