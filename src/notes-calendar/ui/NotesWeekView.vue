<script setup lang="ts">
import { computed, toRaw } from "vue";

import { DayPeriod, MonthPeriod, QuarterPeriod, YearPeriod, type Period, type WeekPeriod } from "@/calendar";
import { useCellDecorations } from "@/decorations";

import { useNotesCell } from "../use-notes-cell";
import { useShelfScope } from "../use-shelf-scope";

import NotesCalendarCell from "./NotesCalendarCell.vue";

const props = defineProps<{
  shelf: string | null;
  week: WeekPeriod;
  weeks?: "none" | "left" | "right";
}>();

const scope = useShelfScope(() => props.shelf);

const dayCell = useNotesCell({ journalNames: () => scope.day.value });
const weekCell = useNotesCell({ journalNames: () => scope.week.value });
const monthCell = useNotesCell({ journalNames: () => scope.month.value });
const quarterCell = useNotesCell({ journalNames: () => scope.quarter.value });
const yearCell = useNotesCell({ journalNames: () => scope.year.value });

const rawWeek = computed(() => toRaw(props.week));
const days = computed(() => [...rawWeek.value.days()].map((d) => DayPeriod.containing(d)));
const monthPeriod = computed(() => MonthPeriod.containing(rawWeek.value.anchor));
const quarterPeriod = computed(() => QuarterPeriod.containing(rawWeek.value.anchor));
const yearPeriod = computed(() => YearPeriod.containing(rawWeek.value.anchor));
const weeksPos = computed(() => props.weeks ?? "left");
const showWeekNumber = computed(() => weeksPos.value !== "none");
const showQuarter = computed(() => scope.quarter.value.length > 0);

const allPeriods = computed<readonly Period[]>(() => {
  const periods: Period[] = [...days.value, monthPeriod.value, yearPeriod.value];
  if (showWeekNumber.value) periods.push(rawWeek.value);
  if (showQuarter.value) periods.push(quarterPeriod.value);
  return periods;
});

useCellDecorations(
  () => allPeriods.value,
  () => scope.all.value,
);
</script>

<template>
  <div class="notes-week-view">
    <div class="notes-week-view__header">
      <slot name="header">
        <NotesCalendarCell data-testid="header-month" :period="monthPeriod" :cell="monthCell" />
        <NotesCalendarCell
          v-if="showQuarter"
          data-testid="header-quarter"
          :period="quarterPeriod"
          :cell="quarterCell"
        />
        <NotesCalendarCell data-testid="header-year" :period="yearPeriod" :cell="yearCell" />
      </slot>
    </div>
    <div class="notes-week-view__row" :data-weeks="showWeekNumber ? weeksPos : null">
      <NotesCalendarCell
        v-if="showWeekNumber && weeksPos === 'left'"
        data-testid="week-number-cell"
        class="notes-week-view__week-number"
        :period="rawWeek"
        :cell="weekCell"
      />
      <NotesCalendarCell v-for="day in days" :key="day.anchor.toAnchor()" :period="day" :cell="dayCell" />
      <NotesCalendarCell
        v-if="showWeekNumber && weeksPos === 'right'"
        data-testid="week-number-cell"
        class="notes-week-view__week-number"
        :period="rawWeek"
        :cell="weekCell"
      />
    </div>
  </div>
</template>

<style scoped>
.notes-week-view {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-2);
}
.notes-week-view__header {
  display: flex;
  justify-content: space-around;
  gap: var(--size-2-2);
}
.notes-week-view__row {
  display: flex;
  gap: var(--size-2-1);
}
.notes-week-view__row > * {
  flex: 1;
  text-align: center;
}
.notes-week-view__week-number {
  font-weight: var(--font-bold);
}
</style>
