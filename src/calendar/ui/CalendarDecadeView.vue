<script setup lang="ts">
import { computed, toRaw } from "vue";

import { CalendarDate } from "@/calendar";
import type { DecadePeriod, OpenInterval, Period, YearPeriod } from "@/calendar";
import UiButton from "@/ui/UiButton.vue";

import CalendarGrid from "./CalendarGrid.vue";
import { useCalendarGrid } from "./use-calendar-grid";

const props = defineProps<{
  outerPeriod: DecadePeriod;
  selected: Period | null;
  bounds?: OpenInterval;
}>();

const emit = defineEmits<{ select: [cell: YearPeriod, event: MouseEvent] }>();

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
    <UiButton
      v-for="cell in grid"
      :key="cell.key"
      data-testid="decade-cell"
      :data-selected="cell.isSelected || null"
      :data-today="cell.isToday || null"
      :disabled="cell.isDisabled"
      @click="emit('select', cell.period as YearPeriod, $event)"
    >
      <slot name="cell" :period="cell.period" :label="cell.label">{{ cell.label }}</slot>
    </UiButton>
  </CalendarGrid>
</template>
