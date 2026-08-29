<script setup lang="ts">
import { computed, toRaw } from "vue";

import {
  DayPeriod,
  MonthPeriod,
  QuarterPeriod,
  YearPeriod,
  type AnchorString,
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
    week: WeekPeriod;
    weeks?: "none" | "left" | "right";
    hiddenWeekdays?: readonly number[];
    showHeader?: boolean;
    selectedDate?: AnchorString;
    selectDate?: NotesDateSelect;
  }>(),
  {
    weeks: undefined,
    hiddenWeekdays: undefined,
    showHeader: true,
    selectedDate: undefined,
    selectDate: undefined,
  },
);

const hiddenWeekdays = computed(() => new Set(props.hiddenWeekdays));

const scope = useShelfScope(() => props.shelf);

const rawWeek = computed(() => toRaw(props.week));
const days = computed(() =>
  [...rawWeek.value.days()]
    .map((d) => DayPeriod.containing(d))
    .filter((d) => !hiddenWeekdays.value.has(Number(d.start.format("d")))),
);
const weekdayNames = computed(() => days.value.map((d) => d.start.format("ddd")));
// A week belongs to the period that owns it, which is the representative day's — not the
// week start's, which for a cross-year week sits in the previous month and year.
const monthPeriod = computed(() => MonthPeriod.containing(rawWeek.value.representative));
const quarterPeriod = computed(() => QuarterPeriod.containing(rawWeek.value.representative));
const yearPeriod = computed(() => YearPeriod.containing(rawWeek.value.representative));
const weeksPos = computed(() => props.weeks ?? "left");
const showWeekNumber = computed(() => weeksPos.value !== "none");
const showQuarter = computed(() => scope.quarter.value.length > 0);

const allPeriods = computed<readonly Period[]>(() => {
  const periods: Period[] = [...days.value, monthPeriod.value, yearPeriod.value];
  if (showWeekNumber.value) periods.push(rawWeek.value);
  if (showQuarter.value) periods.push(quarterPeriod.value);
  return periods;
});

// Same split as the month grid: custom journals contribute only their offset-condition
// decorations to day cells; the rest of their decorations live in the interval list.
const cells = useCellDecorations({
  periods: () => allPeriods.value,
  journalNames: () => scope.all.value,
  filter: (binding) =>
    scope.custom.value.includes(binding.journalName) ? hasOffsetCondition(binding.decoration) : true,
  calendarDecorations: { shelf: () => props.shelf },
});

const dayCell = useNotesCell({
  journalNames: () => scope.day.value,
  decorations: cells,
  shelf: () => props.shelf,
  onSelect: () => props.selectDate,
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

const navigationRows = computed<CalendarGridRows>(() => {
  const items: CalendarGridItem[] = days.value.map((day) => ({
    key: `day:${day.anchor.toAnchor()}`,
    period: day,
  }));
  if (showWeekNumber.value && weeksPos.value === "left") {
    items.unshift({ key: `week:${rawWeek.value.anchor.toAnchor()}`, period: rawWeek.value });
  }
  if (showWeekNumber.value && weeksPos.value === "right") {
    items.push({ key: `week:${rawWeek.value.anchor.toAnchor()}`, period: rawWeek.value });
  }
  return [items];
});

const navigation = useCalendarGridNavigation(navigationRows, () => props.selectedDate);
const grid = navigation.grid;
const isSelected = (period: Period): boolean =>
  props.selectedDate !== undefined && period.representative.toAnchor() === props.selectedDate;
</script>

<template>
  <div class="notes-week-view" :style="appearanceStyle">
    <div v-if="showHeader" class="notes-week-view__header">
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
      class="notes-week-view__grid"
      role="grid"
      :aria-label="rawWeek.format(accessibleFormatPattern('week'))"
      @focusin="navigation.onFocusIn"
      @keydown.capture="navigation.onKeyDown"
    >
      <div class="notes-week-view__weekdays" role="row" :data-weeks="showWeekNumber ? weeksPos : null">
        <div
          v-if="showWeekNumber && weeksPos === 'left'"
          class="notes-week-view__weekday-spacer"
          aria-hidden="true"
        ></div>
        <span v-for="(day, i) in weekdayNames" :key="i" class="notes-week-view__weekday" role="columnheader">
          {{ day }}
        </span>
        <div
          v-if="showWeekNumber && weeksPos === 'right'"
          class="notes-week-view__weekday-spacer"
          aria-hidden="true"
        ></div>
      </div>
      <div class="notes-week-view__row" role="row" :data-weeks="showWeekNumber ? weeksPos : null">
        <NotesCalendarCell
          v-if="showWeekNumber && weeksPos === 'left'"
          data-testid="week-number-cell"
          class="notes-week-view__week-number"
          :period="rawWeek"
          :cell="weekCell"
          role="rowheader"
          :data-grid-key="`week:${rawWeek.anchor.toAnchor()}`"
          :tab-index="navigation.tabIndex(`week:${rawWeek.anchor.toAnchor()}`)"
        />
        <NotesCalendarCell
          v-for="day in days"
          :key="day.anchor.toAnchor()"
          :period="day"
          :cell="dayCell"
          role="gridcell"
          :data-grid-key="`day:${day.anchor.toAnchor()}`"
          :tab-index="navigation.tabIndex(`day:${day.anchor.toAnchor()}`)"
          :selected="isSelected(day)"
        />
        <NotesCalendarCell
          v-if="showWeekNumber && weeksPos === 'right'"
          data-testid="week-number-cell"
          class="notes-week-view__week-number"
          :period="rawWeek"
          :cell="weekCell"
          role="rowheader"
          :data-grid-key="`week:${rawWeek.anchor.toAnchor()}`"
          :tab-index="navigation.tabIndex(`week:${rawWeek.anchor.toAnchor()}`)"
        />
      </div>
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
.notes-week-view__grid {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-2);
}
.notes-week-view__weekdays {
  display: flex;
  gap: var(--size-2-1);
}
.notes-week-view__weekdays > * {
  flex: 1;
  font-size: 0.6em;
  line-height: 1;
  text-align: center;
  color: var(--text-muted);
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
