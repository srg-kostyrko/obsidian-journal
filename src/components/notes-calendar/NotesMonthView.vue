<script setup lang="ts">
import { computed } from "vue";
import { useMonth } from "@/composables/use-month";
import { usePlugin } from "@/composables/use-plugin";
import { useShelfData } from "@/composables/use-shelf";
import CalendarGrid from "../calendar/CalendarGrid.vue";
import NotesCalendarButton from "./NotesCalendarButton.vue";
import CalendarWeekdays from "../calendar/CalendarWeekdays.vue";
import { useActiveNoteData } from "@/composables/use-active-note-data";
import { date_from_string } from "@/calendar";
import { FRONTMATTER_DATE_FORMAT } from "@/constants";

const { refDate } = defineProps<{
  refDate: string;
  hideOutsideDates?: boolean;
}>();
defineEmits<(event: "select" | "selectWeek", date: string, nativeEvent: MouseEvent) => void>();

const plugin = usePlugin();
const columns = computed(() => (plugin.calendarViewSettings.weeks === "none" ? 7 : 8));

const { journals } = useShelfData();
const isQuarterVisible = computed(() => journals.quarter.value.length > 0);
const { grid } = useMonth(computed(() => refDate));

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
  <CalendarGrid class="month-grid" :columns="columns" compact-first-line>
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
      :inactive="hideOutsideDates && uiDate.outside"
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
.month-grid {
  margin-bottom: var(--size-4-2);
}
.week-number {
  font-weight: bold;
}
</style>
