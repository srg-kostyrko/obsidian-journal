<script setup lang="ts">
import { computed } from "vue";
import { usePlugin } from "@/composables/use-plugin";
import { useWeek } from "@/composables/use-week";
import { useShelfData } from "@/composables/use-shelf";
import CalendarGrid from "../calendar/CalendarGrid.vue";
import NotesCalendarButton from "./NotesCalendarButton.vue";
import CalendarWeekdays from "../calendar/CalendarWeekdays.vue";

const { refDate } = defineProps<{
  refDate: string;
  selectedDate?: string;
}>();

const plugin = usePlugin();
const columns = computed(() => (plugin.calendarViewSettings.weeks === "none" ? 7 : 8));

const { journals } = useShelfData();
const isQuarterVisible = computed(() => journals.quarter.value.length > 0);

const { grid } = useWeek(computed(() => refDate));
</script>

<template>
  <CalendarGrid :columns>
    <template #header>
      <slot name="header">
        <NotesCalendarButton :date="refDate" type="month" />
        <NotesCalendarButton v-if="isQuarterVisible" :date="refDate" type="quarter" />
        <NotesCalendarButton :date="refDate" type="year" />
      </slot>
    </template>

    <CalendarWeekdays />

    <NotesCalendarButton
      v-for="uiDate of grid"
      :key="uiDate.key + (uiDate.isWeekNumber ? 'week' : 'day')"
      :date="uiDate.key"
      :type="uiDate.isWeekNumber ? 'week' : 'day'"
      :data-selected="(!uiDate.isWeekNumber && selectedDate === uiDate.key) || null"
      :data-outside="uiDate.outside || null"
      :data-today="uiDate.today || null"
    />
  </CalendarGrid>
</template>
