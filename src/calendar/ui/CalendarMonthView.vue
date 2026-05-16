<script setup lang="ts">
import { computed, toRaw } from "vue";

import { Calendar, CalendarDate, DayPeriod } from "@/calendar";
import type { MonthPeriod, OpenInterval, Period } from "@/calendar";
import { useService } from "@/infrastructure/di";

import CalendarGrid from "./CalendarGrid.vue";
import { useCalendarGrid } from "./use-calendar-grid";

const props = defineProps<{
  outerPeriod: MonthPeriod;
  selected: Period | null;
  bounds?: OpenInterval;
}>();

const emit = defineEmits<{ select: [cell: DayPeriod] }>();

const calendar = useService(Calendar);
const weekdays = computed(() => calendar.weekdays());

const cells = computed(() => {
  const month = toRaw(props.outerPeriod);
  return [...month.weeks()].flatMap((w) => [...w.days()].map((d) => DayPeriod.containing(d)));
});

const today = CalendarDate.today();

const grid = useCalendarGrid({
  cells,
  formatPattern: "D",
  selected: () => props.selected,
  today,
  bounds: () => props.bounds,
  outsidePredicate: (p) => !toRaw(props.outerPeriod).contains(p.start),
});
</script>

<template>
  <CalendarGrid :columns="7">
    <div class="calendar-month-view__weekdays">
      <span
        v-for="(day, i) in weekdays"
        :key="day"
        class="calendar-month-view__weekday"
        :data-testid="i === 0 ? 'weekday-header' : undefined"
        >{{ day.slice(0, 3) }}</span
      >
    </div>
    <button
      v-for="cell in grid"
      :key="cell.key"
      type="button"
      data-testid="month-cell"
      :data-anchor="cell.period.start.toAnchor()"
      :data-selected="cell.isSelected || null"
      :data-outside="cell.isOutside || null"
      :data-today="cell.isToday || null"
      :disabled="cell.isDisabled"
      @click="emit('select', cell.period as DayPeriod)"
    >
      {{ cell.label }}
    </button>
  </CalendarGrid>
</template>

<style scoped>
.calendar-month-view__weekdays {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.calendar-month-view__weekday {
  text-align: center;
  font-size: var(--font-smaller);
  color: var(--text-muted);
}
</style>
