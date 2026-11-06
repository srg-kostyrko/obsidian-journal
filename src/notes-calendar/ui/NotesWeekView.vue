<script setup lang="ts">
import { computed, toRaw, useSlots } from "vue";

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

import { accessibleFormatPattern } from "../cell-format";
import { useNotesCell, type NotesDateSelect } from "../use-notes-cell";
import { useShelfScope } from "../use-shelf-scope";

import NotesCalendarCell from "./NotesCalendarCell.vue";
import {
  useCalendarGridNavigation,
  type CalendarGridItem,
  type CalendarGridRows,
} from "./use-calendar-grid-navigation";

const props = withDefaults(
  defineProps<{
    shelf: string | null;
    week: WeekPeriod;
    weeks?: "none" | "left" | "right";
    hiddenWeekdays?: readonly number[];
    showHeader?: boolean;
    showWeekdays?: boolean;
    selectedDate?: AnchorString;
    selectDate?: NotesDateSelect;
  }>(),
  {
    weeks: undefined,
    hiddenWeekdays: undefined,
    showHeader: true,
    showWeekdays: true,
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
  filter: (binding) => !scope.custom.value.includes(binding.journalName) || hasOffsetCondition(binding.decoration),
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

const slots = useSlots();
// The heading only stops spreading across the grid once something else shares the row
// with it, so the layout switch rides on the slots being filled rather than on a prop
// every other caller would have to pass.
const flanked = computed(() => Boolean(slots["header-start"] ?? slots["header-end"]));

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
  <div class="notes-week-view">
    <div v-if="showHeader" class="notes-week-view__header" :data-flanked="flanked || null">
      <slot name="header-start" />
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
      <slot name="header-end" />
    </div>
    <div
      ref="grid"
      class="notes-week-view__grid"
      role="grid"
      :aria-label="rawWeek.format(accessibleFormatPattern('week'))"
      @focusin="navigation.onFocusIn"
      @keydown.capture="navigation.onKeyDown"
    >
      <div
        class="notes-week-view__weekdays"
        :class="{ 'notes-week-view__weekdays--visually-hidden': !showWeekdays }"
        role="row"
        :data-weeks="showWeekNumber ? weeksPos : null"
      >
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
          class="notes-week-view__day"
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
/* A container cannot query itself, so the private values below sit on the root's descendants. Each
   resolves its catalog value once, and the narrow query re-resolves it, so rules read only `--_v-*`. */
.notes-week-view {
  container: journal-calendar / inline-size;
  display: flex;
  flex-direction: column;
  gap: var(--size-2-2);
}
/* Chromium 120 still makes a size container a stacking context, which traps the lifted cell of an open
   mark popover (NotesCalendarCell) inside this grid, under whatever follows it, such as the next week
   of a timeline. Lift the grid with it. */
.notes-week-view:has(.mark-overflow__popover) {
  position: relative;
  z-index: var(--layer-popover);
}
.notes-week-view__header {
  --_v-heading-size: var(--journal-cell-heading-size, var(--journal-saved-cell-heading-size, inherit));
  --_v-heading-weight: var(--journal-cell-heading-weight, var(--journal-saved-cell-heading-weight, inherit));
  --_v-heading-italic: var(--journal-cell-heading-italic, var(--journal-saved-cell-heading-italic, inherit));
  --_v-heading-color: var(--journal-cell-heading-color, var(--journal-saved-cell-heading-color, inherit));
  --_v-heading-case: var(--journal-cell-heading-case, var(--journal-saved-cell-heading-case, inherit));
  display: flex;
  justify-content: space-around;
  gap: var(--size-2-2);
  font-size: var(--_v-heading-size);
  font-weight: var(--_v-heading-weight);
  font-style: var(--_v-heading-italic);
  color: var(--_v-heading-color);
  text-transform: var(--_v-heading-case);
}
/* Flanked by the timeline block's previous/next controls, the heading is the navigation
   row: it centres instead of reaching the strip's edges, because Obsidian overlays its
   edit-block button on the block's top-right corner and a control under it never gets
   the click. */
.notes-week-view__header[data-flanked] {
  justify-content: center;
}
.notes-week-view__grid {
  --_v-cell-gap: var(--journal-cell-cell-gap, var(--journal-saved-cell-cell-gap, var(--size-2-1)));
  display: flex;
  flex-direction: column;
  gap: var(--size-2-2);
}
.notes-week-view__weekdays {
  --_v-weekday-size: var(--journal-cell-weekday-size, var(--journal-saved-cell-weekday-size, 0.6em));
  --_v-weekday-weight: var(--journal-cell-weekday-weight, var(--journal-saved-cell-weekday-weight, inherit));
  --_v-weekday-italic: var(--journal-cell-weekday-italic, var(--journal-saved-cell-weekday-italic, inherit));
  --_v-weekday-color: var(--journal-cell-weekday-color, var(--journal-saved-cell-weekday-color, var(--text-muted)));
  --_v-weekday-case: var(--journal-cell-weekday-case, var(--journal-saved-cell-weekday-case, inherit));
  display: flex;
  gap: var(--_v-cell-gap);
}
.notes-week-view__weekdays--visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.notes-week-view__weekdays > * {
  flex: 1;
  font-size: var(--_v-weekday-size);
  font-weight: var(--_v-weekday-weight);
  font-style: var(--_v-weekday-italic);
  line-height: 1;
  text-align: center;
  color: var(--_v-weekday-color);
  text-transform: var(--_v-weekday-case);
}
.notes-week-view__row {
  display: flex;
  gap: var(--_v-cell-gap);
}
.notes-week-view__row > * {
  flex: 1;
  text-align: center;
}
/* Week numbers and dates are cells, whose color the cell's state precedence owns; `--_part-color` is
   the bottom of that chain, so a state with no text color of its own leaves the part's color. */
.notes-week-view__week-number {
  --_v-week-number-size: var(--journal-cell-week-number-size, var(--journal-saved-cell-week-number-size, inherit));
  --_v-week-number-weight: var(
    --journal-cell-week-number-weight,
    var(--journal-saved-cell-week-number-weight, var(--font-bold))
  );
  --_v-week-number-italic: var(
    --journal-cell-week-number-italic,
    var(--journal-saved-cell-week-number-italic, inherit)
  );
  --_v-week-number-color: var(--journal-cell-week-number-color, var(--journal-saved-cell-week-number-color, inherit));
  --_v-week-number-case: var(--journal-cell-week-number-case, var(--journal-saved-cell-week-number-case, inherit));
  --_part-color: var(--_v-week-number-color);
  font-size: var(--_v-week-number-size);
  font-weight: var(--_v-week-number-weight);
  font-style: var(--_v-week-number-italic);
  text-transform: var(--_v-week-number-case);
}
.notes-week-view__day {
  --_v-date-size: var(--journal-cell-date-size, var(--journal-saved-cell-date-size, inherit));
  --_v-date-weight: var(--journal-cell-date-weight, var(--journal-saved-cell-date-weight, inherit));
  --_v-date-italic: var(--journal-cell-date-italic, var(--journal-saved-cell-date-italic, inherit));
  --_v-date-color: var(--journal-cell-date-color, var(--journal-saved-cell-date-color, inherit));
  --_v-date-case: var(--journal-cell-date-case, var(--journal-saved-cell-date-case, inherit));
  --_part-color: var(--_v-date-color);
  font-size: var(--_v-date-size);
  font-weight: var(--_v-date-weight);
  font-style: var(--_v-date-italic);
  text-transform: var(--_v-date-case);
}
@container journal-calendar (max-width: 28em) {
  .notes-week-view__header {
    --_v-heading-size: var(
      --journal-cell-heading-size-narrow,
      var(
        --journal-saved-cell-heading-size-narrow,
        var(--journal-cell-heading-size, var(--journal-saved-cell-heading-size, inherit))
      )
    );
    --_v-heading-weight: var(
      --journal-cell-heading-weight-narrow,
      var(
        --journal-saved-cell-heading-weight-narrow,
        var(--journal-cell-heading-weight, var(--journal-saved-cell-heading-weight, inherit))
      )
    );
    --_v-heading-italic: var(
      --journal-cell-heading-italic-narrow,
      var(
        --journal-saved-cell-heading-italic-narrow,
        var(--journal-cell-heading-italic, var(--journal-saved-cell-heading-italic, inherit))
      )
    );
    --_v-heading-color: var(
      --journal-cell-heading-color-narrow,
      var(
        --journal-saved-cell-heading-color-narrow,
        var(--journal-cell-heading-color, var(--journal-saved-cell-heading-color, inherit))
      )
    );
    --_v-heading-case: var(
      --journal-cell-heading-case-narrow,
      var(
        --journal-saved-cell-heading-case-narrow,
        var(--journal-cell-heading-case, var(--journal-saved-cell-heading-case, inherit))
      )
    );
  }
  .notes-week-view__grid {
    --_v-cell-gap: var(
      --journal-cell-cell-gap-narrow,
      var(
        --journal-saved-cell-cell-gap-narrow,
        var(--journal-cell-cell-gap, var(--journal-saved-cell-cell-gap, var(--size-2-1)))
      )
    );
  }
  .notes-week-view__weekdays {
    --_v-weekday-size: var(
      --journal-cell-weekday-size-narrow,
      var(
        --journal-saved-cell-weekday-size-narrow,
        var(--journal-cell-weekday-size, var(--journal-saved-cell-weekday-size, 0.6em))
      )
    );
    --_v-weekday-weight: var(
      --journal-cell-weekday-weight-narrow,
      var(
        --journal-saved-cell-weekday-weight-narrow,
        var(--journal-cell-weekday-weight, var(--journal-saved-cell-weekday-weight, inherit))
      )
    );
    --_v-weekday-italic: var(
      --journal-cell-weekday-italic-narrow,
      var(
        --journal-saved-cell-weekday-italic-narrow,
        var(--journal-cell-weekday-italic, var(--journal-saved-cell-weekday-italic, inherit))
      )
    );
    --_v-weekday-color: var(
      --journal-cell-weekday-color-narrow,
      var(
        --journal-saved-cell-weekday-color-narrow,
        var(--journal-cell-weekday-color, var(--journal-saved-cell-weekday-color, var(--text-muted)))
      )
    );
    --_v-weekday-case: var(
      --journal-cell-weekday-case-narrow,
      var(
        --journal-saved-cell-weekday-case-narrow,
        var(--journal-cell-weekday-case, var(--journal-saved-cell-weekday-case, inherit))
      )
    );
  }
  .notes-week-view__week-number {
    --_v-week-number-size: var(
      --journal-cell-week-number-size-narrow,
      var(
        --journal-saved-cell-week-number-size-narrow,
        var(--journal-cell-week-number-size, var(--journal-saved-cell-week-number-size, inherit))
      )
    );
    --_v-week-number-weight: var(
      --journal-cell-week-number-weight-narrow,
      var(
        --journal-saved-cell-week-number-weight-narrow,
        var(--journal-cell-week-number-weight, var(--journal-saved-cell-week-number-weight, var(--font-bold)))
      )
    );
    --_v-week-number-italic: var(
      --journal-cell-week-number-italic-narrow,
      var(
        --journal-saved-cell-week-number-italic-narrow,
        var(--journal-cell-week-number-italic, var(--journal-saved-cell-week-number-italic, inherit))
      )
    );
    --_v-week-number-color: var(
      --journal-cell-week-number-color-narrow,
      var(
        --journal-saved-cell-week-number-color-narrow,
        var(--journal-cell-week-number-color, var(--journal-saved-cell-week-number-color, inherit))
      )
    );
    --_v-week-number-case: var(
      --journal-cell-week-number-case-narrow,
      var(
        --journal-saved-cell-week-number-case-narrow,
        var(--journal-cell-week-number-case, var(--journal-saved-cell-week-number-case, inherit))
      )
    );
  }
  .notes-week-view__day {
    --_v-date-size: var(
      --journal-cell-date-size-narrow,
      var(
        --journal-saved-cell-date-size-narrow,
        var(--journal-cell-date-size, var(--journal-saved-cell-date-size, inherit))
      )
    );
    --_v-date-weight: var(
      --journal-cell-date-weight-narrow,
      var(
        --journal-saved-cell-date-weight-narrow,
        var(--journal-cell-date-weight, var(--journal-saved-cell-date-weight, inherit))
      )
    );
    --_v-date-italic: var(
      --journal-cell-date-italic-narrow,
      var(
        --journal-saved-cell-date-italic-narrow,
        var(--journal-cell-date-italic, var(--journal-saved-cell-date-italic, inherit))
      )
    );
    --_v-date-color: var(
      --journal-cell-date-color-narrow,
      var(
        --journal-saved-cell-date-color-narrow,
        var(--journal-cell-date-color, var(--journal-saved-cell-date-color, inherit))
      )
    );
    --_v-date-case: var(
      --journal-cell-date-case-narrow,
      var(
        --journal-saved-cell-date-case-narrow,
        var(--journal-cell-date-case, var(--journal-saved-cell-date-case, inherit))
      )
    );
  }
}
</style>
