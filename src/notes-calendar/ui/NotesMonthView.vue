<script setup lang="ts">
import { computed, toRaw, useSlots } from "vue";

import {
  advance,
  DayPeriod,
  QuarterPeriod,
  YearPeriod,
  type AnchorString,
  type MonthPeriod,
  type OutsideDates,
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
    month: MonthPeriod;
    outsideDates?: OutsideDates;
    weeks?: "none" | "left" | "right";
    hiddenWeekdays?: readonly number[];
    showHeader?: boolean;
    showWeekdays?: boolean;
    sixRows?: boolean;
    selectedDate?: AnchorString;
    selectDate?: NotesDateSelect;
  }>(),
  {
    outsideDates: "active",
    weeks: undefined,
    hiddenWeekdays: undefined,
    showHeader: true,
    showWeekdays: true,
    sixRows: false,
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

const SIX_ROWS = 6;

const rows = computed<readonly WeekRow[]>(() => {
  const out: WeekRow[] = [];
  const weeks = [...rawMonth.value.weeks()];
  const last = weeks.at(-1);
  if (props.sixRows && last) {
    for (let ahead = 1; weeks.length < SIX_ROWS; ahead += 1) weeks.push(advance(last, ahead));
  }
  for (const week of weeks) {
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
  filter: (binding) => !scope.custom.value.includes(binding.journalName) || hasOffsetCondition(binding.decoration),
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

const slots = useSlots();
// The heading only stops spreading across the grid once something else shares the row
// with it, so the layout switch rides on the slots being filled rather than on a prop
// every other caller would have to pass.
const flanked = computed(() => Boolean(slots["header-start"] ?? slots["header-end"]));

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
  <div class="notes-month-view">
    <div v-if="showHeader" class="notes-month-view__header" :data-flanked="flanked || null">
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
      class="notes-month-view__grid"
      role="grid"
      :aria-label="rawMonth.format(accessibleFormatPattern('month'))"
      :data-weeks="showWeekNumber ? weeksPos : null"
      :style="{ '--day-columns': dayColumns }"
      @focusin="navigation.onFocusIn"
      @keydown.capture="navigation.onKeyDown"
    >
      <div
        class="notes-month-view__row"
        :class="{ 'notes-month-view__row--visually-hidden': !showWeekdays }"
        role="row"
      >
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
            :outside="day.isOutside"
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
/* A container cannot query itself, so the private values below sit on the root's descendants. Each
   resolves its catalog value once, and the narrow query re-resolves it, so rules read only `--_v-*`. */
.notes-month-view {
  container: journal-calendar / inline-size;
  display: flex;
  flex-direction: column;
  gap: var(--size-2-2);
}
/* Chromium 120 still makes a size container a stacking context, which traps the lifted cell of an open
   mark popover (NotesCalendarCell) inside this grid, under whatever follows it, such as the next month
   of a timeline. Lift the grid with it. */
.notes-month-view:has(.mark-overflow__popover) {
  position: relative;
  z-index: var(--layer-popover);
}
.notes-month-view__header {
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
.notes-month-view__header[data-flanked] {
  justify-content: center;
}
.notes-month-view__grid {
  --_v-cell-gap: var(--journal-cell-cell-gap, var(--journal-saved-cell-cell-gap, var(--size-2-1)));
  display: grid;
  grid-template-columns: repeat(var(--day-columns, 7), 1fr);
  gap: var(--_v-cell-gap);
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
  gap: var(--_v-cell-gap);
}
@supports not (grid-template-columns: subgrid) {
  .notes-month-view__row {
    display: contents;
  }
}
.notes-month-view__row--visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.notes-month-view__weekday {
  --_v-weekday-size: var(--journal-cell-weekday-size, var(--journal-saved-cell-weekday-size, 0.6em));
  --_v-weekday-weight: var(--journal-cell-weekday-weight, var(--journal-saved-cell-weekday-weight, inherit));
  --_v-weekday-italic: var(--journal-cell-weekday-italic, var(--journal-saved-cell-weekday-italic, inherit));
  --_v-weekday-color: var(--journal-cell-weekday-color, var(--journal-saved-cell-weekday-color, var(--text-muted)));
  --_v-weekday-case: var(--journal-cell-weekday-case, var(--journal-saved-cell-weekday-case, inherit));
  font-size: var(--_v-weekday-size);
  font-weight: var(--_v-weekday-weight);
  font-style: var(--_v-weekday-italic);
  line-height: 1;
  text-align: center;
  color: var(--_v-weekday-color);
  text-transform: var(--_v-weekday-case);
  display: flex;
  justify-content: center;
  align-items: end;
}
/* Week numbers and dates are cells, whose color the cell's state precedence owns; `--_part-color` is
   the bottom of that chain, so a state with no text color of its own leaves the part's color. Dates
   outside the month take the date values too; the outside highlight's text sits above `--_part-color`,
   so they stay muted. */
.notes-month-view__week-number {
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
.notes-month-view__day {
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
/* A hidden outside day is no cell, so it reads the cell's row height itself; a padded week of blanks
   would otherwise collapse when no week number holds the row open. */
.notes-month-view__day--blank {
  --_v-cell-min-height: var(--journal-cell-cell-min-height, var(--journal-saved-cell-cell-min-height, 26px));
  min-height: var(--_v-cell-min-height);
}
@container journal-calendar (max-width: 28em) {
  .notes-month-view__day--blank {
    --_v-cell-min-height: var(
      --journal-cell-cell-min-height-narrow,
      var(
        --journal-saved-cell-cell-min-height-narrow,
        var(--journal-cell-cell-min-height, var(--journal-saved-cell-cell-min-height, 26px))
      )
    );
  }
  .notes-month-view__header {
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
  .notes-month-view__grid {
    --_v-cell-gap: var(
      --journal-cell-cell-gap-narrow,
      var(
        --journal-saved-cell-cell-gap-narrow,
        var(--journal-cell-cell-gap, var(--journal-saved-cell-cell-gap, var(--size-2-1)))
      )
    );
  }
  .notes-month-view__weekday {
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
  .notes-month-view__week-number {
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
  .notes-month-view__day {
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
