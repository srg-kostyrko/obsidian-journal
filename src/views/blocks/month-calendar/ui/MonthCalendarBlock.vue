<script setup lang="ts">
import { computed } from "vue";

import { useResolvedWeekPlacement } from "@/calendar";
import { usePeriodWindow } from "@/calendar/ui";
import { m } from "@/i18n";
import NotesMonthView from "@/notes-calendar/ui/NotesMonthView.vue";
import { useFollowActiveDate } from "@/notes-calendar/use-follow-active-date";
import { useShelfScope } from "@/notes-calendar/use-shelf-scope";

import { useViewContext } from "../../../view-context";
import { monthWindowContains } from "../../ui/follow-visibility";

import type { BlockInstanceId } from "../../../config";
import type { MonthCalendarConfig } from "../month-calendar-block";

const props = defineProps<{
  instanceId: BlockInstanceId;
  config: MonthCalendarConfig;
}>();

const viewContext = useViewContext();
const scope = useShelfScope(() => viewContext.shelf.value);

const focus = useFollowActiveDate({
  refDate: viewContext.refDate,
  enabled: () => props.config.followActiveDate ?? true,
  // Follow custom-interval notes too — v2 recentered the panel for every journal
  // type; only the cell highlight is fixed-journal-scoped.
  inScope: (name) => scope.all.value.includes(name),
  isVisible: (anchor, focusAnchor) => monthWindowContains(anchor, focusAnchor, props.config.before, props.config.after),
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
    <div v-if="scope.all.value.length === 0" class="journal-view-calendar-empty">
      {{ m.view_block_calendar_no_journals() }}
    </div>
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
.journal-view-calendar-empty {
  color: var(--text-faint);
  text-align: center;
}
</style>
