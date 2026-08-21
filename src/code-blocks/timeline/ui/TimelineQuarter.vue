<script setup lang="ts">
import { computed } from "vue";

import { CalendarDate, QuarterPeriod, type AnchorString, type MonthPeriod } from "@/calendar";
import { horizontalReservation, useCellPadding } from "@/decorations";
import { NotesMonthView, useShelfScope } from "@/notes-calendar";

const props = defineProps<{
  refDate: AnchorString;
  shelf: string | null;
  weeks?: "none" | "left" | "right";
  hiddenWeekdays?: readonly number[];
}>();

const months = computed<readonly MonthPeriod[]>(() => {
  const quarter = QuarterPeriod.containing(CalendarDate.fromAnchor(props.refDate));
  return [...quarter.months()];
});

// The row sizes its columns around what a decorated month needs, so it reads the same
// reservation the cells inside it paint with.
const scope = useShelfScope(() => props.shelf);
const padding = useCellPadding({
  journalNames: () => scope.all.value,
  calendarDecorations: { shelf: () => props.shelf },
});
const gridStyle = computed(() => ({ "--journal-cell-padding-inline": horizontalReservation(padding.value) }));
</script>

<template>
  <div class="timeline-quarter" :style="gridStyle">
    <NotesMonthView
      v-for="month in months"
      :key="month.anchor.toAnchor()"
      :shelf
      :month
      :weeks="weeks"
      :hidden-weekdays="hiddenWeekdays"
      outside-dates="blank"
    />
  </div>
</template>

<style scoped>
.timeline-quarter {
  --gap: var(--size-4-4);
  --line-offset: calc(var(--gap) / 2);
  --line-thickness: 1px;
  --line-color: var(--text-faint);
  /* A month never shrinks below its own content, so a fixed column count overflows the note
     and clips the last month rather than wrapping once decorations widen the cells. 10.7em
     covers the week column, seven two-digit day cells and the gaps between them; every unit
     of reserved cell padding lands on both sides of all eight columns, hence 16. Measured
     against a rendered month grid — the figure picks the column count alone, so drift costs
     a column, never a clipped month. The third of the row keeps three months as the maximum
     however wide the note is. */
  --month-min: calc(10.7em + 16 * var(--journal-cell-padding-inline, 2px));
  display: grid;
  gap: var(--gap);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, max(var(--month-min), (100% - 2 * var(--gap)) / 3)), 1fr));
}
.timeline-quarter > * {
  position: relative;
}
.timeline-quarter > *::before,
.timeline-quarter > *::after {
  content: "";
  position: absolute;
  background-color: var(--line-color);
  z-index: 1;
}
.timeline-quarter > *::after {
  inline-size: 100%;
  block-size: var(--line-thickness);
  inset-inline-start: 0;
  inset-block-start: calc(var(--line-offset) * -1);
}
.timeline-quarter > *::before {
  inline-size: var(--line-thickness);
  block-size: 100%;
  inset-block-start: 0;
  inset-inline-start: calc(var(--line-offset) * -1);
}
</style>
