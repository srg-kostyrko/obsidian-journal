<script setup lang="ts">
import { useResolvedWeekPlacement } from "@/calendar";
import { usePeriodWindow } from "@/calendar/ui";
import NotesWeekView from "@/notes-calendar/ui/NotesWeekView.vue";

import { useViewContext } from "../../../view-context";
import { weekWindowContains } from "../../ui/follow-visibility";
import { useWindowAnchor } from "../../ui/use-window-anchor";

import type { BlockInstanceId } from "../../../config";
import type { WeekCalendarConfig } from "../week-calendar-block";

const props = defineProps<{
  instanceId: BlockInstanceId;
  config: WeekCalendarConfig;
}>();

const viewContext = useViewContext();

const focus = useWindowAnchor({
  refDate: viewContext.refDate,
  origin: viewContext.refDateOrigin,
  contains: (date, anchor) => weekWindowContains(date, anchor, props.config.before, props.config.after),
});

const weeks = usePeriodWindow(
  "week",
  focus,
  () => props.config.before,
  () => props.config.after,
);

const weekPlacement = useResolvedWeekPlacement(() => props.config.weeks);
</script>

<template>
  <div class="journal-view-week-calendar">
    <NotesWeekView
      v-for="week of weeks"
      :key="week.start.toAnchor()"
      :week="week"
      :shelf="viewContext.shelf.value"
      :weeks="weekPlacement"
      :hidden-weekdays="config.hiddenWeekdays"
      :show-header="config.showHeading"
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
