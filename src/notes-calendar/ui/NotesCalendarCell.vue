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
/* Actionable cells open a note on click; inactive (non-actionable) cells offer nothing — they
   keep the plain cursor rather than not-allowed, since they are decoration, not disabled
   controls (same reasoning as the inert period buttons in the toolbar). */
.notes-calendar-cell {
  cursor: pointer;
  /* Height would otherwise come entirely from the decorations' shared padding, so a vault with no
     journals — or one whose decorations are colour-only and reserve no padding — collapses every
     row to a bare text line. 26px is a floor, not a fixed row, so taller decorations still grow
     it. The cell is flex so the decoration stretches to fill that floor instead of resolving its
     height: 100% against a parent that has only a min-height. */
  display: flex;
  min-height: 26px;
  border-radius: var(--radius-s);
}
.notes-calendar-cell[data-inactive] {
  cursor: default;
}
/* A cell takes a tab stop, so it has to show where the keyboard is. A real <button> gets a
   focus ring from Obsidian for free; a span with tabindex does not, which would leave a
   keyboard user tabbing ~35 cells with nothing to see. Same rule as the date-picker grid. */
.notes-calendar-cell:focus-visible {
  outline: 2px solid var(--background-modifier-border-focus);
  outline-offset: -1px;
}
/* [data-active] follows [data-today] so a cell that is both the open note and today resolves
   to the active colors — the note you're viewing wins over the today marker. */
.notes-calendar-cell[data-today] {
  color: var(--journal-cell-today-color);
  background-color: var(--journal-cell-today-bg);
}
.notes-calendar-cell[data-active] {
  color: var(--journal-cell-active-color);
  background-color: var(--journal-cell-active-bg);
}
</style>
