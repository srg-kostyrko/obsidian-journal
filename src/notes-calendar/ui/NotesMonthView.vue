<script setup lang="ts">
import { computed, toRaw } from "vue";

import { DayPeriod, QuarterPeriod, YearPeriod, type MonthPeriod, type Period, type WeekPeriod } from "@/calendar";
import { useCellDecorations } from "@/decorations";

import { useNotesCell, type NotesCellApi } from "../use-notes-cell";
import { useShelfScope } from "../use-shelf-scope";

import NotesCalendarCell from "./NotesCalendarCell.vue";

const props = withDefaults(
  defineProps<{
    shelf: string | null;
    month: MonthPeriod;
    hideOutsideDates?: boolean;
    weeks?: "none" | "left" | "right";
    hiddenWeekdays?: readonly number[];
    showHeader?: boolean;
  }>(),
  { hideOutsideDates: undefined, weeks: undefined, hiddenWeekdays: undefined, showHeader: true },
);

const hiddenWeekdays = computed(() => new Set(props.hiddenWeekdays));
const dayColumns = computed(() => 7 - [0, 1, 2, 3, 4, 5, 6].filter((i) => hiddenWeekdays.value.has(i)).length);

const scope = useShelfScope(() => props.shelf);

const dayCell = useNotesCell({ journalNames: () => scope.day.value });
const weekCell = useNotesCell({ journalNames: () => scope.week.value });
const monthCell = useNotesCell({ journalNames: () => scope.month.value });
const quarterCell = useNotesCell({ journalNames: () => scope.quarter.value });
const yearCell = useNotesCell({ journalNames: () => scope.year.value });

const rawMonth = computed(() => toRaw(props.month));
const weeksPos = computed(() => props.weeks ?? "left");
const showWeekNumber = computed(() => weeksPos.value !== "none");
const showQuarter = computed(() => scope.quarter.value.length > 0);

interface WeekRow {
  readonly key: string;
  readonly weekPeriod: WeekPeriod;
  readonly days: readonly { period: DayPeriod; isOutside: boolean }[];
}

const rows = computed<readonly WeekRow[]>(() => {
  const out: WeekRow[] = [];
  for (const week of rawMonth.value.weeks()) {
    const days = [...week.days()]
      .map((d) => ({
        period: DayPeriod.containing(d),
        isOutside: !rawMonth.value.contains(d),
      }))
      .filter(({ period }) => !hiddenWeekdays.value.has(Number(period.start.format("d"))));
    out.push({ key: week.anchor.toAnchor(), weekPeriod: week, days });
  }
  return out;
});

const weekdayNames = computed(() => (rows.value[0]?.days ?? []).map((d) => d.period.start.format("ddd")));

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
    <div v-if="showHeader !== false" class="notes-month-view__header">
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
    <div
      class="notes-month-view__grid"
      :data-weeks="showWeekNumber ? weeksPos : null"
      :style="{ '--day-columns': dayColumns }"
    >
      <div
        v-if="showWeekNumber && weeksPos === 'left'"
        class="notes-month-view__weekday-spacer"
        aria-hidden="true"
      ></div>
      <span v-for="(day, i) in weekdayNames" :key="i" class="notes-month-view__weekday">{{ day }}</span>
      <div
        v-if="showWeekNumber && weeksPos === 'right'"
        class="notes-month-view__weekday-spacer"
        aria-hidden="true"
      ></div>
      <template v-for="row in rows" :key="row.key">
        <NotesCalendarCell
          v-if="showWeekNumber && weeksPos === 'left'"
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
        <NotesCalendarCell
          v-if="showWeekNumber && weeksPos === 'right'"
          data-testid="week-number-cell"
          class="notes-month-view__week-number"
          :period="row.weekPeriod"
          :cell="weekCell"
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
  grid-template-columns: repeat(var(--day-columns, 7), 1fr);
  gap: var(--size-2-1);
}
.notes-month-view__grid[data-weeks="left"] {
  grid-template-columns: auto repeat(var(--day-columns, 7), 1fr);
}
.notes-month-view__grid[data-weeks="right"] {
  grid-template-columns: repeat(var(--day-columns, 7), 1fr) auto;
}
.notes-month-view__weekday {
  font-size: 0.6em;
  line-height: 1;
  text-align: center;
  color: var(--text-muted);
  display: flex;
  justify-content: center;
  align-items: end;
}
.notes-month-view__week-number {
  font-weight: var(--font-bold);
}
.notes-month-view__day[data-outside] {
  color: var(--text-muted);
}
</style>
