<script setup lang="ts">
import { computed, toRaw } from "vue";

import { CalendarDate } from "@/calendar";
import type { Period } from "@/calendar";
import { CellDecoration } from "@/decorations";
import { useModifierHoverPreview } from "@/ui/use-modifier-hover-preview";

import { accessibleFormatPattern, defaultFormatPattern } from "../cell-format";

import type { NotesCellApi } from "../use-notes-cell";

const props = defineProps<{
  period: Period;
  cell: NotesCellApi;
  format?: string;
}>();

const rawPeriod = computed(() => toRaw(props.period));
const label = computed(() => rawPeriod.value.format(props.format ?? defaultFormatPattern(rawPeriod.value.kind)));
const isActive = computed(() => props.cell.isActive(rawPeriod.value));
const isInactive = computed(() => !props.cell.isActionable(rawPeriod.value));
const isToday = computed(() => rawPeriod.value.contains(CalendarDate.today()));
// Only an actionable cell is a control; an inert one is decoration and naming it would add
// noise to the announcement without offering anything to activate.
const accessibleName = computed(() =>
  isInactive.value ? undefined : rawPeriod.value.format(accessibleFormatPattern(rawPeriod.value.kind)),
);

const hover = useModifierHoverPreview();
</script>

<template>
  <span
    class="notes-calendar-cell"
    :role="isInactive ? undefined : 'button'"
    :tabindex="isInactive ? undefined : 0"
    :aria-label="accessibleName"
    :data-active="isActive || null"
    :data-inactive="isInactive || null"
    :data-anchor="rawPeriod.anchor.toAnchor()"
    :data-today="isToday || null"
    @click="cell.open(rawPeriod, $event)"
    @auxclick.middle.prevent="cell.open(rawPeriod, $event)"
    @keydown.enter="cell.open(rawPeriod, $event)"
    @keydown.space.prevent="cell.open(rawPeriod, $event)"
    @contextmenu.prevent="cell.openContextMenu(rawPeriod, $event)"
    @mouseenter="hover.enter($event, (event) => cell.openPreview(rawPeriod, event))"
    @mouseleave="hover.leave()"
  >
    <CellDecoration :period="rawPeriod">{{ label }}</CellDecoration>
  </span>
</template>

<style scoped>
/* Actionable cells open a note on click; inactive (non-actionable) cells offer nothing. */
.notes-calendar-cell {
  cursor: pointer;
}
.notes-calendar-cell[data-inactive] {
  cursor: not-allowed;
}
/* A cell takes a tab stop, so it has to show where the keyboard is. v2's cell was a real
   <button> and got this from Obsidian for free; a span with tabindex does not, which left a
   keyboard user tabbing ~35 cells with nothing to see. Same rule as the date-picker grid. */
.notes-calendar-cell:focus-visible {
  outline: 2px solid var(--background-modifier-border-focus);
  outline-offset: -1px;
}
/* [data-active] follows [data-today] so a cell that is both the open note and today resolves
   to the active colors — the note you're viewing wins over the today marker (v2). */
.notes-calendar-cell[data-today] {
  color: var(--journal-cell-today-color);
  background-color: var(--journal-cell-today-bg);
}
.notes-calendar-cell[data-active] {
  color: var(--journal-cell-active-color);
  background-color: var(--journal-cell-active-bg);
}
</style>
