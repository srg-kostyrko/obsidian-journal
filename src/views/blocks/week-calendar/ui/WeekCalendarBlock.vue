<script setup lang="ts">
import { usePeriodWindow } from "@/calendar/ui";
import NotesWeekView from "@/notes-calendar/ui/NotesWeekView.vue";
import { useFollowActiveDate } from "@/notes-calendar/use-follow-active-date";
import { useShelfScope } from "@/notes-calendar/use-shelf-scope";

import { useViewContext } from "../../../view-context";
import { weekWindowContains } from "../../ui/follow-visibility";

import type { BlockInstanceId } from "../../../config";
import type { WeekCalendarConfig } from "../week-calendar-block";

const props = defineProps<{
  instanceId: BlockInstanceId;
  config: WeekCalendarConfig;
}>();

const viewContext = useViewContext();
const scope = useShelfScope(() => viewContext.shelf.value);

const focus = useFollowActiveDate({
  refDate: viewContext.refDate,
  enabled: () => props.config.followActiveDate ?? true,
  inScope: (name) => scope.fixed.value.includes(name),
  isVisible: (anchor, focusAnchor) => weekWindowContains(anchor, focusAnchor, props.config.before, props.config.after),
});

const weeks = usePeriodWindow(
  "week",
  focus,
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
