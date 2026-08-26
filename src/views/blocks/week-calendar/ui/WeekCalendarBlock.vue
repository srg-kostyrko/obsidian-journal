<script setup lang="ts">
import { useResolvedWeekPlacement } from "@/calendar";
import { usePeriodWindow } from "@/calendar/ui";
import NotesWeekView from "@/notes-calendar/ui/NotesWeekView.vue";

import { useViewContext } from "../../../view-context";
import VaultDayNotesPanel from "../../day-notes/ui/VaultDayNotesPanel.vue";
import { useDayNotesPanel } from "../../day-notes/use-day-notes-panel";
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

const dayNotes = useDayNotesPanel(viewContext.shelf, (anchor) => viewContext.setRefDate(anchor));
</script>

<template>
  <div
    class="journal-view-week-calendar-stack"
    :class="{ 'journal-view-week-calendar-stack--preview-open': dayNotes.selectedAnchor.value !== null }"
  >
    <div class="journal-view-week-calendar">
      <NotesWeekView
        v-for="week of weeks"
        :key="week.start.toAnchor()"
        :week="week"
        :shelf="viewContext.shelf.value"
        :weeks="weekPlacement"
        :hidden-weekdays="config.hiddenWeekdays"
        :show-header="config.showHeading"
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
.journal-view-week-calendar-stack {
  display: flex;
  flex-direction: column;
  gap: var(--size-4-2);
}
.journal-view-week-calendar-stack--preview-open {
  min-height: 0;
  flex: 1 1 0;
}
.journal-view-week-calendar {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: var(--size-4-2);
}
</style>
