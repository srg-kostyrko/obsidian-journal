<script setup lang="ts">
import { computed, toRaw } from "vue";

import { CalendarDate } from "@/calendar";
import type { MonthPeriod, OpenInterval, Period, YearPeriod } from "@/calendar";
import UiButton from "@/ui/UiButton.vue";

import CalendarGrid from "./CalendarGrid.vue";
import { useCalendarGrid } from "./use-calendar-grid";

const props = defineProps<{
  outerPeriod: YearPeriod;
  selected: Period | null;
  bounds?: OpenInterval;
}>();

const emit = defineEmits<{ select: [cell: MonthPeriod] }>();

const cells = computed(() => [...toRaw(props.outerPeriod).months()]);

const today = CalendarDate.today();

const grid = useCalendarGrid({
  cells,
  formatPattern: "MMM",
  selected: () => props.selected,
  today,
  bounds: () => props.bounds,
});
</script>

<template>
  <CalendarGrid :columns="3">
    <UiButton
      v-for="cell in grid"
      :key="cell.key"
      data-testid="year-cell"
      :data-selected="cell.isSelected || null"
      :data-today="cell.isToday || null"
      :disabled="cell.isDisabled"
      @click="emit('select', cell.period as MonthPeriod)"
    >
      {{ cell.label }}
    </UiButton>
  </CalendarGrid>
</template>
