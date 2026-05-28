<script setup lang="ts">
import { computed, toRaw } from "vue";

import { DayPeriod, QuarterPeriod, YearPeriod, type MonthPeriod, type Period, type WeekPeriod } from "@/calendar";
import { useCellDecorations } from "@/decorations";

import { useNotesCell, type NotesCellApi } from "../use-notes-cell";
import { useShelfScope } from "../use-shelf-scope";

import NotesCalendarCell from "./NotesCalendarCell.vue";

const props = defineProps<{
  shelf: string | null;
  month: MonthPeriod;
  hideOutsideDates?: boolean;
}>();

const scope = useShelfScope(() => props.shelf);

const dayCell = useNotesCell({ journalNames: () => scope.day.value });
const weekCell = useNotesCell({ journalNames: () => scope.week.value });
const monthCellApi = useNotesCell({ journalNames: () => scope.month.value });
const quarterCellApi = useNotesCell({ journalNames: () => scope.quarter.value });
const yearCellApi = useNotesCell({ journalNames: () => scope.year.value });

const rawMonth = computed(() => toRaw(props.month));
const showWeekNumber = computed(() => scope.week.value.length > 0);
const showQuarter = computed(() => scope.quarter.value.length > 0);

interface WeekRow {
  readonly key: string;
  readonly weekPeriod: WeekPeriod;
  readonly days: readonly { period: DayPeriod; isOutside: boolean }[];
}

const rows = computed<readonly WeekRow[]>(() => {
  const out: WeekRow[] = [];
  for (const week of rawMonth.value.weeks()) {
    const days = [...week.days()].map((d) => ({
      period: DayPeriod.containing(d),
      isOutside: !rawMonth.value.contains(d),
    }));
    out.push({ key: week.anchor.toAnchor(), weekPeriod: week, days });
  }
  return out;
});

const monthPeriod = computed(() => rawMonth.value);
const quarterPeriod = computed(() => QuarterPeriod.containing(rawMonth.value.anchor));
const yearPeriod = computed(() => YearPeriod.containing(rawMonth.value.anchor));

const visiblePeriods = computed<readonly Period[]>(() => {
  const periods: Period[] = [monthPeriod.value, yearPeriod.value];
  if (showQuarter.value) periods.push(quarterPeriod.value);
  for (const row of rows.value) {
    if (showWeekNumber.value) periods.push(row.weekPeriod);
    for (const d of row.days) periods.push(d.period);
  }
  return periods;
});

useCellDecorations(
  () => visiblePeriods.value,
  () => scope.all.value,
);

const noop = (): void => {
  // outside-month cells have no journal action
};

function inactiveCell(): NotesCellApi {
  return {
    open: noop,
    openContextMenu: noop,
    openPreview: noop,
    isActive: () => false,
    isActionable: () => false,
  };
}

const inactiveDay = inactiveCell();
</script>

<template>
  <div class="notes-month-view">
    <div class="notes-month-view__header">
      <slot name="header">
        <NotesCalendarCell data-testid="header-month" :period="monthPeriod" :cell="monthCellApi" />
        <NotesCalendarCell
          v-if="showQuarter"
          data-testid="header-quarter"
          :period="quarterPeriod"
          :cell="quarterCellApi"
        />
        <NotesCalendarCell data-testid="header-year" :period="yearPeriod" :cell="yearCellApi" />
      </slot>
    </div>
    <div class="notes-month-view__grid" :data-with-weeks="showWeekNumber || null">
      <template v-for="row in rows" :key="row.key">
        <NotesCalendarCell
          v-if="showWeekNumber"
          data-testid="week-number-cell"
          class="notes-month-view__week-number"
          :period="row.weekPeriod"
          :cell="weekCell"
        />
        <NotesCalendarCell
          v-for="day in row.days"
          :key="day.period.anchor.toAnchor()"
          class="notes-month-view__day"
          :data-outside="day.isOutside || null"
          :period="day.period"
          :cell="hideOutsideDates && day.isOutside ? inactiveDay : dayCell"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.notes-month-view {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-2);
}
.notes-month-view__header {
  display: flex;
  justify-content: space-around;
  gap: var(--size-2-2);
}
.notes-month-view__grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: var(--size-2-1);
}
.notes-month-view__grid[data-with-weeks] {
  grid-template-columns: auto repeat(7, 1fr);
}
.notes-month-view__week-number {
  font-weight: var(--font-bold);
}
.notes-month-view__day[data-outside] {
  color: var(--text-muted);
}
</style>
