<script setup lang="ts">
import { computed } from "vue";

import { useResolvedWeekPlacement } from "@/calendar";
import { usePeriodWindow } from "@/calendar/ui";
import NotesMonthView from "@/notes-calendar/ui/NotesMonthView.vue";

import { useViewContext } from "../../../view-context";
import VaultDayNotesPanel from "../../day-notes/ui/VaultDayNotesPanel.vue";
import { useDayNotesPanel } from "../../day-notes/use-day-notes-panel";
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

const dayNotes = useDayNotesPanel(viewContext.shelf, (anchor) => viewContext.setRefDate(anchor));
</script>

<template>
  <div
    class="journal-view-month-calendar-stack"
    :class="{ 'journal-view-month-calendar-stack--preview-open': dayNotes.selectedAnchor.value !== null }"
  >
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
        :select-days="dayNotes.enabled.value"
        :selected-anchor="dayNotes.selectedAnchor.value"
        @day-select="dayNotes.select"
      />
    </div>
    <VaultDayNotesPanel
      v-if="dayNotes.selectedAnchor.value !== null"
      v-model:sort="dayNotes.sort.value"
      v-model:include-journals="dayNotes.includeJournals.value"
      :notes="dayNotes.notes.value"
      @previous="dayNotes.previous"
      @next="dayNotes.next"
      @close="dayNotes.close"
    />
  </div>
</template>

<style scoped>
.journal-view-month-calendar-stack {
  display: flex;
  flex-direction: column;
  gap: var(--size-4-2);
}
.journal-view-month-calendar-stack--preview-open {
  min-height: 0;
  flex: 1 1 0;
}
.journal-view-month-calendar {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: var(--size-4-2);
}
</style>
