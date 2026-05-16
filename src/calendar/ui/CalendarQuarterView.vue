<script setup lang="ts">
import { computed, toRaw } from "vue";

import { CalendarDate } from "@/calendar";
import type { OpenInterval, Period, QuarterPeriod, YearPeriod } from "@/calendar";

import CalendarGrid from "./CalendarGrid.vue";
import { useCalendarGrid } from "./use-calendar-grid";

const props = defineProps<{
  outerPeriod: YearPeriod;
  selected: Period | null;
  bounds?: OpenInterval;
}>();

const emit = defineEmits<{ select: [cell: QuarterPeriod] }>();

const cells = computed(() => [...toRaw(props.outerPeriod).quarters()]);

const today = CalendarDate.today();

const grid = useCalendarGrid({
  cells,
  formatPattern: "[Q]Q",
  selected: () => props.selected,
  today,
  bounds: () => props.bounds,
});
</script>

<template>
  <CalendarGrid :columns="2">
    <button
      v-for="cell in grid"
      :key="cell.key"
      type="button"
      data-testid="quarter-cell"
      :data-selected="cell.isSelected || null"
      :data-today="cell.isToday || null"
      :disabled="cell.isDisabled"
      @click="emit('select', cell.period as QuarterPeriod)"
    >
      {{ cell.label }}
    </button>
  </CalendarGrid>
</template>
