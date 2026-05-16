<script setup lang="ts">
import { computed, toRaw } from "vue";

import { CalendarDate } from "@/calendar";
import type { DecadePeriod, OpenInterval, Period, YearPeriod } from "@/calendar";

import CalendarGrid from "./CalendarGrid.vue";
import { useCalendarGrid } from "./use-calendar-grid";

const props = defineProps<{
  outerPeriod: DecadePeriod;
  selected: Period | null;
  bounds?: OpenInterval;
}>();

const emit = defineEmits<{ select: [cell: YearPeriod] }>();

const cells = computed(() => [...toRaw(props.outerPeriod).years()]);

const today = CalendarDate.today();

const grid = useCalendarGrid({
  cells,
  formatPattern: "YYYY",
  selected: () => props.selected,
  today,
  bounds: () => props.bounds,
});
</script>

<template>
  <CalendarGrid :columns="4">
    <button
      v-for="cell in grid"
      :key="cell.key"
      type="button"
      data-testid="decade-cell"
      :data-selected="cell.isSelected || null"
      :data-today="cell.isToday || null"
      :disabled="cell.isDisabled"
      @click="emit('select', cell.period as YearPeriod)"
    >
      {{ cell.label }}
    </button>
  </CalendarGrid>
</template>
