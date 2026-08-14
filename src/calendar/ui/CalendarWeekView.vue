<script setup lang="ts">
import { computed, toRaw } from "vue";

import { CalendarDate } from "@/calendar";
import type { MonthPeriod, OpenInterval, Period, WeekPeriod } from "@/calendar";
import UiButton from "@/ui/UiButton.vue";

import CalendarGrid from "./CalendarGrid.vue";
import { useCalendarGrid } from "./use-calendar-grid";

const props = defineProps<{
  outerPeriod: MonthPeriod;
  selected: Period | null;
  bounds?: OpenInterval;
}>();

const emit = defineEmits<{ select: [cell: WeekPeriod, event: MouseEvent] }>();

const cells = computed(() => [...toRaw(props.outerPeriod).weeks()]);

const today = CalendarDate.today();

const grid = useCalendarGrid({
  cells,
  formatPattern: "[W]w",
  selected: () => props.selected,
  today,
  bounds: () => props.bounds,
});
</script>

<template>
  <CalendarGrid :columns="1">
    <UiButton
      v-for="cell in grid"
      :key="cell.key"
      data-testid="week-cell"
      :data-anchor="cell.period.anchor.toAnchor()"
      :data-selected="cell.isSelected || null"
      :data-today="cell.isToday || null"
      :disabled="cell.isDisabled"
      @click="emit('select', cell.period as WeekPeriod, $event)"
    >
      <slot name="cell" :period="cell.period" :label="cell.label">
        <span>{{ cell.label }}</span>
        <span>
          {{ (cell.period as WeekPeriod).start.format("MMM D") }} –
          {{ (cell.period as WeekPeriod).end.format("MMM D") }}
        </span>
      </slot>
    </UiButton>
  </CalendarGrid>
</template>
