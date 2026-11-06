<script setup lang="ts">
import { computed, provide, shallowReactive, shallowRef, useTemplateRef, watchEffect } from "vue";

import {
  advance,
  calendarDisplaySlice,
  DayPeriod,
  resolveOutsideDates,
  type PeriodKind,
  YearPeriod,
  type CalendarDisplaySliceState,
  type Period,
} from "@/calendar";
import { useToday } from "@/calendar/ui";
import type { JournalDecorationStyle } from "@/decorations/config";
import { cellKey } from "@/decorations/engine";
import { CellDecorationMapKey, type CellStyleRef } from "@/decorations/ui/cell-decoration-map-key";

import { labelPattern, weekdayTexts } from "../../cell-format";
import NotesCalendarCell from "../../ui/NotesCalendarCell.vue";

import { partsAt, sampleDays } from "./preview-sample";

import type { NotesCellApi } from "../../use-notes-cell";
import type { PartKey, Width } from "../appearance-parts";

/** `spot` is the anchor of the day a part was picked at, if it was picked at one. */
const props = withDefaults(
  defineProps<{ width: Width; display?: CalendarDisplaySliceState; picked?: PartKey; spot?: string }>(),
  { display: () => calendarDisplaySlice.defaults, picked: undefined, spot: undefined },
);
const emit = defineEmits<{ pick: [parts: readonly PartKey[], spot: string | undefined] }>();

// Wide fills what it is given, but never below the calendar's 28em breakpoint, where it would draw the narrow look.
const SIZES: Readonly<Record<Width, Readonly<Record<string, string>>>> = {
  wide: { width: "100%", minWidth: "30em" },
  narrow: { width: "260px" },
};

const SAMPLE_DECORATION: readonly JournalDecorationStyle[] = [
  { type: "background", color: { type: "theme", name: "text-highlight-bg" } },
  { type: "color", color: { type: "theme", name: "text-accent" } },
];

const today = useToday();
const sample = computed(() => sampleDays(today.value));
const month = computed(() => sample.value.month);
const year = computed(() => YearPeriod.containing(month.value.anchor));

// One month shows, so Automatic resolves the way a lone month block does.
const outsideDates = computed(() => resolveOutsideDates(props.display.outsideDays, "active"));
const weeksPos = computed(() => props.display.weekPlacement);

const SIX_ROWS = 6;

const rows = computed(() => {
  const weeks = [...month.value.weeks()];
  const last = weeks.at(-1);
  if (props.display.monthRows === "six" && last) {
    for (let ahead = 1; weeks.length < SIX_ROWS; ahead += 1) weeks.push(advance(last, ahead));
  }
  return weeks.map((week) => ({
    key: week.anchor.toAnchor(),
    week,
    days: [...week.days()].map((day) => ({ period: DayPeriod.containing(day), outside: !month.value.contains(day) })),
  }));
});
const format = (kind: PeriodKind): string => labelPattern(props.display.labels, kind);
// Unlike the views' column headers, these spans have no role to name, so the visible text is what is read;
// the hidden width's text is `display: none`, out of the tree.
const weekdays = computed(() => {
  const { weekdayLabel, weekdayLabelNarrow } = props.display;
  return (rows.value[0]?.days ?? []).map(({ period }) => weekdayTexts(period.start, weekdayLabel, weekdayLabelNarrow));
});

const root = useTemplateRef<HTMLElement>("root");
defineExpose({ root });

function noop(): void {
  // Clicks pick a part instead of opening a note, so the preview reaches no service.
}

const cell: NotesCellApi = {
  open: noop,
  openContextMenu: noop,
  openPreview: noop,
  isActive: (period) => period.kind === "day" && period.anchor.toAnchor() === sample.value.active,
  isActionable: () => true,
};
const inertCell: NotesCellApi = { ...cell, isActive: () => false, isActionable: () => false };
const isSelected = (period: Period): boolean => period.anchor.toAnchor() === sample.value.selected;

// CellDecoration injects the map once, so the map itself stays and only its entries follow the day.
const decorations = shallowReactive(new Map<string, CellStyleRef>());
watchEffect(() => {
  decorations.clear();
  for (const anchor of sample.value.decorated) decorations.set(cellKey("day", anchor), shallowRef(SAMPLE_DECORATION));
});
provide(CellDecorationMapKey, decorations);

// A property check rather than instanceof, which fails for an event from a popout's realm.
function isElement(target: EventTarget | null): target is Element {
  return target !== null && "closest" in target;
}

function onPick(event: Event): void {
  if (!isElement(event.target)) return;
  const parts = partsAt(event.target);
  if (parts.length === 0) return;
  emit("pick", parts, event.target.closest<HTMLElement>('[data-preview-part="date"]')?.dataset.anchor);
}

// A state outlines every day in it. Every day is a date number and a cell, so those two outline the day
// they were picked at, or every day when they were not. One element takes a strong outline; a part
// spread over many takes a light one on each, or a grid of heavy boxes would bury the calendar.
function isPickedDay(day: { period: DayPeriod; outside: boolean }): boolean {
  const anchor = day.period.anchor.toAnchor();
  switch (props.picked) {
    case "today": {
      return anchor === today.value.toAnchor();
    }
    case "selected": {
      return anchor === sample.value.selected;
    }
    case "active": {
      return anchor === sample.value.active;
    }
    case "outside": {
      return day.outside;
    }
    case "date":
    case "cell": {
      return props.spot === undefined || props.spot === anchor;
    }
    default: {
      return false;
    }
  }
}

const pickedCount = computed(() => {
  switch (props.picked) {
    case undefined: {
      return 0;
    }
    case "heading": {
      return 2;
    }
    case "weekday": {
      return weekdays.value.length;
    }
    case "weekNumber": {
      return rows.value.length;
    }
    case "grid": {
      return 1;
    }
    default: {
      return rows.value.reduce((count, row) => count + row.days.filter(isPickedDay).length, 0);
    }
  }
});

function pickedClass(isPicked: boolean): Record<string, boolean> {
  return {
    "appearance-preview__picked": isPicked,
    "appearance-preview__picked--light": isPicked && pickedCount.value > 1,
  };
}
</script>

<template>
  <div
    ref="root"
    class="appearance-preview"
    :data-custom-day-label="display.labels.day !== '' || null"
    :style="SIZES[width]"
    @click="onPick"
    @keydown.enter="onPick"
    @keydown.space.prevent="onPick"
  >
    <div v-if="display.showHeading" class="appearance-preview__header" data-preview-part="heading">
      <NotesCalendarCell
        :class="pickedClass(picked === 'heading')"
        :period="month"
        :cell="cell"
        :format="format('month')"
      />
      <NotesCalendarCell
        :class="pickedClass(picked === 'heading')"
        :period="year"
        :cell="cell"
        :format="format('year')"
      />
    </div>
    <div
      class="appearance-preview__grid"
      :class="pickedClass(picked === 'grid')"
      :data-weeks="weeksPos === 'none' ? null : weeksPos"
      data-preview-grid
    >
      <div
        class="appearance-preview__row"
        :class="{ 'appearance-preview__row--visually-hidden': !display.showWeekdays }"
      >
        <div v-if="weeksPos === 'left'" class="appearance-preview__weekday-spacer" aria-hidden="true"></div>
        <span
          v-for="(day, i) in weekdays"
          :key="i"
          class="appearance-preview__weekday"
          :class="pickedClass(picked === 'weekday')"
          data-preview-part="weekday"
        >
          <span class="appearance-preview__weekday-wide">{{ day.wide }}</span>
          <span class="appearance-preview__weekday-narrow">{{ day.narrow }}</span>
        </span>
        <div v-if="weeksPos === 'right'" class="appearance-preview__weekday-spacer" aria-hidden="true"></div>
      </div>
      <div v-for="row in rows" :key="row.key" class="appearance-preview__row">
        <NotesCalendarCell
          v-if="weeksPos === 'left'"
          class="appearance-preview__week-number"
          :class="pickedClass(picked === 'weekNumber')"
          data-preview-part="weekNumber"
          :period="row.week"
          :cell="cell"
          :format="format('week')"
        />
        <template v-for="day in row.days" :key="day.period.anchor.toAnchor()">
          <span
            v-if="outsideDates === 'blank' && day.outside"
            class="appearance-preview__day appearance-preview__day--blank"
            :class="pickedClass(picked === 'outside')"
            data-preview-part="outside"
            aria-hidden="true"
          ></span>
          <NotesCalendarCell
            v-else
            class="appearance-preview__day"
            :class="pickedClass(isPickedDay(day))"
            data-preview-part="date"
            :period="day.period"
            :cell="outsideDates === 'inactive' && day.outside ? inertCell : cell"
            :format="format('day')"
            :outside="day.outside"
            :selected="isSelected(day.period)"
          />
        </template>
        <NotesCalendarCell
          v-if="weeksPos === 'right'"
          class="appearance-preview__week-number"
          :class="pickedClass(picked === 'weekNumber')"
          data-preview-part="weekNumber"
          :period="row.week"
          :cell="cell"
          :format="format('week')"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* A container cannot query itself, so the grid readers sit on the root's descendants. They are copied
   from NotesMonthView; ui/appearance-readers.test.ts keeps the two in step. */
.appearance-preview {
  container: journal-calendar / inline-size;
  display: flex;
  flex-direction: column;
  gap: var(--size-2-2);
}
/* Outside the element's box and stacked over its neighbors, so it moves nothing in the grid and never
   reaches the state layers inside a cell; dashed, so it reads as the editor's mark, not a state. */
.appearance-preview__picked {
  z-index: 1;
  outline: 2px dashed var(--interactive-accent);
  outline-offset: 1px;
}
/* The plain accent first, for a WebView without color-mix. */
.appearance-preview__picked--light {
  outline: 1px dotted var(--interactive-accent);
  outline: 1px dotted color-mix(in srgb, var(--interactive-accent) 55%, transparent);
  outline-offset: 0;
}
.appearance-preview__header {
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
.appearance-preview__grid {
  --_v-cell-gap: var(--journal-cell-cell-gap, var(--journal-saved-cell-cell-gap, var(--size-2-1)));
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: var(--_v-cell-gap);
}
.appearance-preview__grid[data-weeks="left"] {
  grid-template-columns: auto repeat(7, 1fr);
}
.appearance-preview__grid[data-weeks="right"] {
  grid-template-columns: repeat(7, 1fr) auto;
}
.appearance-preview__row {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: subgrid;
  gap: var(--_v-cell-gap);
}
@supports not (grid-template-columns: subgrid) {
  .appearance-preview__row {
    display: contents;
  }
}
/* Hidden from view, not from the tree, as the month view hides it: screen readers keep the column names.
   A block, over the no-subgrid `display: contents`, which would leave no box to clip. */
.appearance-preview__row--visually-hidden {
  display: block;
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.appearance-preview__weekday {
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
.appearance-preview__weekday-narrow {
  display: none;
}
/* Cells take their part's color through `--_part-color`, never `color`, as the month view does. */
.appearance-preview__week-number {
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
.appearance-preview__day {
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
.appearance-preview__day--blank {
  --_v-cell-min-height: var(--journal-cell-cell-min-height, var(--journal-saved-cell-cell-min-height, 26px));
  min-height: var(--_v-cell-min-height);
}
/* As the month view: only a custom day label gives up the day's content-sized floor. */
[data-custom-day-label] .appearance-preview__day {
  min-width: 0;
}
@container journal-calendar (max-width: 28em) {
  .appearance-preview__weekday-wide {
    display: none;
  }
  .appearance-preview__weekday-narrow {
    display: inline;
  }
  .appearance-preview__day--blank {
    --_v-cell-min-height: var(
      --journal-cell-cell-min-height-narrow,
      var(
        --journal-saved-cell-cell-min-height-narrow,
        var(--journal-cell-cell-min-height, var(--journal-saved-cell-cell-min-height, 26px))
      )
    );
  }
  .appearance-preview__header {
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
  .appearance-preview__grid {
    --_v-cell-gap: var(
      --journal-cell-cell-gap-narrow,
      var(
        --journal-saved-cell-cell-gap-narrow,
        var(--journal-cell-cell-gap, var(--journal-saved-cell-cell-gap, var(--size-2-1)))
      )
    );
  }
  .appearance-preview__weekday {
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
  .appearance-preview__week-number {
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
  .appearance-preview__day {
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
