<script setup lang="ts">
import { computed, toRaw } from "vue";

import {
  DayPeriod,
  QuarterPeriod,
  YearPeriod,
  type AnchorString,
  type MonthPeriod,
  type Period,
  type WeekPeriod,
} from "@/calendar";
import { hasOffsetCondition, useCellDecorations } from "@/decorations";

import { useCalendarAppearanceStyle } from "../appearance/use-appearance-style";
import { accessibleFormatPattern } from "../cell-format";
import { useNotesCell, type NotesDateSelect } from "../use-notes-cell";
import { useShelfScope } from "../use-shelf-scope";

import NotesCalendarCell from "./NotesCalendarCell.vue";
import {
  useCalendarGridNavigation,
  type CalendarGridItem,
  type CalendarGridRows,
} from "./use-calendar-grid-navigation";

const appearanceStyle = useCalendarAppearanceStyle();

const props = withDefaults(
  defineProps<{
    shelf: string | null;
    month: MonthPeriod;
    outsideDates?: "active" | "inactive" | "blank";
    weeks?: "none" | "left" | "right";
    hiddenWeekdays?: readonly number[];
    showHeader?: boolean;
    selectedDate?: AnchorString;
    selectDate?: NotesDateSelect;
  }>(),
  {
    outsideDates: "active",
    weeks: undefined,
    hiddenWeekdays: undefined,
    showHeader: true,
    selectedDate: undefined,
    selectDate: undefined,
  },
);

const blankOutside = computed(() => props.outsideDates === "blank");
const inactiveOutside = computed(() => props.outsideDates === "inactive");

const hiddenWeekdays = computed(() => new Set(props.hiddenWeekdays));
const dayColumns = computed(() => 7 - [0, 1, 2, 3, 4, 5, 6].filter((i) => hiddenWeekdays.value.has(i)).length);

const scope = useShelfScope(() => props.shelf);

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
    for (const d of row.days) {
      if (blankOutside.value && d.isOutside) continue;
      periods.push(d.period);
    }
  }
  return periods;
});

// Fixed journals decorate their own cells; custom journals contribute only their
// offset-condition decorations, which mark single days inside an interval — everything
// else a custom journal defines renders in the interval list instead.
const cells = useCellDecorations({
  periods: () => visiblePeriods.value,
  journalNames: () => scope.all.value,
  filter: (binding) =>
    scope.custom.value.includes(binding.journalName) ? hasOffsetCondition(binding.decoration) : true,
  calendarDecorations: { shelf: () => props.shelf },
});

const selection = { onSelect: () => props.selectDate };
const dayCell = useNotesCell({
  journalNames: () => scope.day.value,
  decorations: cells,
  shelf: () => props.shelf,
  ...selection,
});
const weekCell = useNotesCell({
  journalNames: () => scope.week.value,
  decorations: cells,
  shelf: () => props.shelf,
});
const monthCell = useNotesCell({
  journalNames: () => scope.month.value,
  decorations: cells,
  shelf: () => props.shelf,
});
const quarterCell = useNotesCell({
  journalNames: () => scope.quarter.value,
  decorations: cells,
  shelf: () => props.shelf,
});
const yearCell = useNotesCell({
  journalNames: () => scope.year.value,
  decorations: cells,
  shelf: () => props.shelf,
});
const inactiveDay = useNotesCell({ journalNames: () => [], ...selection });

const navigationRows = computed<CalendarGridRows>(() =>
  rows.value.map((row) => {
    const items: (CalendarGridItem | null)[] = row.days.map((day) =>
      blankOutside.value && day.isOutside ? null : { key: `day:${day.period.anchor.toAnchor()}`, period: day.period },
    );
    if (showWeekNumber.value && weeksPos.value === "left") {
      items.unshift({ key: `week:${row.key}`, period: row.weekPeriod });
    }
    if (showWeekNumber.value && weeksPos.value === "right") {
      items.push({ key: `week:${row.key}`, period: row.weekPeriod });
    }
    return items;
  }),
);

const navigation = useCalendarGridNavigation(navigationRows, () => props.selectedDate);
const grid = navigation.grid;
const isSelected = (period: Period): boolean =>
  props.selectedDate !== undefined && period.representative.toAnchor() === props.selectedDate;
</script>

<template>
  <div class="notes-month-view" :style="appearanceStyle">
    <div v-if="showHeader" class="notes-month-view__header">
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
      ref="grid"
      class="notes-month-view__grid"
      role="grid"
      :aria-label="rawMonth.format(accessibleFormatPattern('month'))"
      :data-weeks="showWeekNumber ? weeksPos : null"
      :style="{ '--day-columns': dayColumns }"
      @focusin="navigation.onFocusIn"
      @keydown.capture="navigation.onKeyDown"
    >
      <div class="notes-month-view__row" role="row">
        <div
          v-if="showWeekNumber && weeksPos === 'left'"
          class="notes-month-view__weekday-spacer"
          aria-hidden="true"
        ></div>
        <span v-for="(day, i) in weekdayNames" :key="i" class="notes-month-view__weekday" role="columnheader">
          {{ day }}
        </span>
        <div
          v-if="showWeekNumber && weeksPos === 'right'"
          class="notes-month-view__weekday-spacer"
          aria-hidden="true"
        ></div>
      </div>
      <div v-for="row in rows" :key="row.key" class="notes-month-view__row" role="row">
        <NotesCalendarCell
          v-if="showWeekNumber && weeksPos === 'left'"
          data-testid="week-number-cell"
          class="notes-month-view__week-number"
          :period="row.weekPeriod"
          :cell="weekCell"
          role="rowheader"
          :data-grid-key="`week:${row.key}`"
          :tab-index="navigation.tabIndex(`week:${row.key}`)"
        />
        <template v-for="day in row.days" :key="day.period.anchor.toAnchor()">
          <span
            v-if="blankOutside && day.isOutside"
            class="notes-month-view__day notes-month-view__day--blank"
            aria-hidden="true"
          ></span>
          <NotesCalendarCell
            v-else
            class="notes-month-view__day"
            :data-outside="day.isOutside || null"
            :period="day.period"
            :cell="inactiveOutside && day.isOutside ? inactiveDay : dayCell"
            role="gridcell"
            :data-grid-key="`day:${day.period.anchor.toAnchor()}`"
            :tab-index="navigation.tabIndex(`day:${day.period.anchor.toAnchor()}`)"
            :selected="isSelected(day.period)"
          />
        </template>
        <NotesCalendarCell
          v-if="showWeekNumber && weeksPos === 'right'"
          data-testid="week-number-cell"
          class="notes-month-view__week-number"
          :period="row.weekPeriod"
          :cell="weekCell"
          role="rowheader"
          :data-grid-key="`week:${row.key}`"
          :tab-index="navigation.tabIndex(`week:${row.key}`)"
        />
      </div>
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
.notes-month-view__row {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: subgrid;
  gap: var(--size-2-1);
}
@supports not (grid-template-columns: subgrid) {
  .notes-month-view__row {
    display: contents;
  }
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
