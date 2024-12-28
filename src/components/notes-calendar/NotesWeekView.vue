<script setup lang="ts">
import { computed } from "vue";
import { usePlugin } from "@/composables/use-plugin";
import { useWeek } from "@/composables/use-week";
import { useShelfData } from "@/composables/use-shelf";
import { useActiveNoteData } from "@/composables/use-active-note-data";
import CalendarGrid from "../calendar/CalendarGrid.vue";
import NotesCalendarButton from "./NotesCalendarButton.vue";
import CalendarWeekdays from "../calendar/CalendarWeekdays.vue";
import { FRONTMATTER_DATE_FORMAT } from "@/constants";
import { date_from_string } from "@/calendar";

const { refDate } = defineProps<{
  refDate: string;
}>();

const plugin = usePlugin();
const columns = computed(() => (plugin.calendarViewSettings.weeks === "none" ? 7 : 8));

const { journals } = useShelfData();
const isQuarterVisible = computed(() => journals.quarter.value.length > 0);

const { grid } = useWeek(computed(() => refDate));

const monthRefDate = computed(() => {
  return date_from_string(refDate).startOf("month").format(FRONTMATTER_DATE_FORMAT);
});
const quarterRefDate = computed(() => {
  return date_from_string(refDate).startOf("quarter").format(FRONTMATTER_DATE_FORMAT);
});
const yearRefDate = computed(() => {
  return date_from_string(refDate).startOf("year").format(FRONTMATTER_DATE_FORMAT);
});

const activeNoteData = useActiveNoteData(plugin);
const activeNoteJournal = computed(() => {
  if (!activeNoteData.value) return null;
  return plugin.getJournal(activeNoteData.value.journal);
});
const isDayActive = computed(() => activeNoteJournal.value?.type === "day");
const isWeekActive = computed(() => activeNoteJournal.value?.type === "week");
const isMonthActive = computed(
  () => activeNoteJournal.value?.type === "month" && activeNoteData.value?.date === monthRefDate.value,
);
const isQuarterActive = computed(
  () => activeNoteJournal.value?.type === "quarter" && activeNoteData.value?.date === quarterRefDate.value,
);
const isYearActive = computed(
  () => activeNoteJournal.value?.type === "year" && activeNoteData.value?.date === yearRefDate.value,
);
</script>

<template>
  <CalendarGrid :columns>
    <template #header>
      <slot name="header">
        <NotesCalendarButton :date="refDate" type="month" :data-selected="isMonthActive ? '' : null" />
        <NotesCalendarButton
          v-if="isQuarterVisible"
          :date="refDate"
          type="quarter"
          :data-selected="isQuarterActive ? '' : null"
        />
        <NotesCalendarButton :date="refDate" type="year" :data-selected="isYearActive ? '' : null" />
      </slot>
    </template>

    <CalendarWeekdays />

    <NotesCalendarButton
      v-for="uiDate of grid"
      :key="uiDate.key + (uiDate.isWeekNumber ? 'week' : 'day')"
      :class="{ 'week-number': uiDate.isWeekNumber }"
      :date="uiDate.key"
      :type="uiDate.isWeekNumber ? 'week' : 'day'"
      :data-outside="uiDate.outside || null"
      :data-today="uiDate.today || null"
      :data-selected="
        activeNoteData &&
        ((uiDate.isWeekNumber && isWeekActive) || (!uiDate.isWeekNumber && isDayActive)) &&
        activeNoteData?.date === uiDate.key
          ? ''
          : null
      "
    />
  </CalendarGrid>
</template>

<style scoped>
.week-number {
  font-weight: bold;
}
</style>
