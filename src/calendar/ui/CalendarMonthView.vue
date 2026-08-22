<script setup lang="ts">
import { computed, toRaw } from "vue";

import { DayPeriod } from "@/calendar";
import type { MonthPeriod, OpenInterval, Period } from "@/calendar";
import UiButton from "@/ui/UiButton.vue";

import CalendarGrid from "./CalendarGrid.vue";
import { useCalendarGrid } from "./use-calendar-grid";
import { useToday } from "./use-today";

const props = defineProps<{
  outerPeriod: MonthPeriod;
  selected: Period | null;
  bounds?: OpenInterval;
}>();

const emit = defineEmits<{ select: [cell: DayPeriod, event: MouseEvent] }>();

const cells = computed(() => {
  const month = toRaw(props.outerPeriod);
  return [...month.weeks()].flatMap((w) => [...w.days()].map((d) => DayPeriod.containing(d)));
});

// Deriving the header from the grid's own first week keeps the two in step; a
// separately-rotated weekday list can drift from the cells it labels.
const weekdays = computed(() => cells.value.slice(0, 7).map((d) => d.start.format("ddd")));

const today = useToday();

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
      <span v-for="day in weekdays" :key="day" class="calendar-month-view__weekday" data-testid="weekday-header">{{
        day
      }}</span>
    </div>
    <UiButton
      v-for="cell in grid"
      :key="cell.key"
      data-testid="month-cell"
      :data-anchor="cell.period.start.toAnchor()"
      :data-selected="cell.isSelected || null"
      :data-outside="cell.isOutside || null"
      :data-today="cell.isToday || null"
      :disabled="cell.isDisabled"
      @click="emit('select', cell.period as DayPeriod, $event)"
    >
      <slot name="cell" :period="cell.period" :label="cell.label">{{ cell.label }}</slot>
    </UiButton>
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
