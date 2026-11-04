<script setup lang="ts">
import { computed, toRaw } from "vue";

import type { Period } from "@/calendar";
import { useToday } from "@/calendar/ui";
import { CellDecoration } from "@/decorations";
import { useModifierHoverPreview } from "@/ui/use-modifier-hover-preview";

import { accessibleFormatPattern, defaultFormatPattern } from "../cell-format";

import type { NotesCellApi } from "../use-notes-cell";

const props = defineProps<{
  period: Period;
  cell: NotesCellApi;
  format?: string;
  role?: "gridcell" | "rowheader";
  tabIndex?: number;
  selected?: boolean;
}>();

const rawPeriod = computed(() => toRaw(props.period));
const label = computed(() => rawPeriod.value.format(props.format ?? defaultFormatPattern(rawPeriod.value.kind)));
const isActive = computed(() => props.cell.isActive(rawPeriod.value));
const isInactive = computed(() => !props.cell.isActionable(rawPeriod.value));
const isControl = computed(() => props.role !== undefined || !isInactive.value);
const resolvedRole = computed(() => props.role ?? (isControl.value ? "button" : undefined));
const resolvedTabIndex = computed(() => props.tabIndex ?? (isControl.value ? 0 : undefined));
const today = useToday();
const isToday = computed(() => rawPeriod.value.contains(today.value));
const accessibleName = computed(() =>
  isControl.value ? rawPeriod.value.format(accessibleFormatPattern(rawPeriod.value.kind)) : undefined,
);

const hover = useModifierHoverPreview();
</script>

<template>
  <span
    class="notes-calendar-cell"
    :role="resolvedRole"
    :tabindex="resolvedTabIndex"
    :aria-label="accessibleName"
    :aria-selected="selected || undefined"
    :data-active="isActive || null"
    :data-inactive="isInactive || null"
    :data-anchor="rawPeriod.anchor.toAnchor()"
    :data-today="isToday || null"
    :data-selected="selected || null"
    @click="cell.open(rawPeriod, $event)"
    @auxclick.middle.prevent="cell.open(rawPeriod, $event)"
    @keydown.enter="cell.open(rawPeriod, $event)"
    @keydown.space.prevent="cell.open(rawPeriod, $event)"
    @contextmenu.prevent="cell.openContextMenu(rawPeriod, $event)"
    @mouseenter="hover.enter($event, (event) => cell.openPreview(rawPeriod, event))"
    @mouseleave="hover.leave()"
  >
    <span v-if="isToday" class="notes-calendar-cell__layer" data-layer="today" aria-hidden="true" />
    <span v-if="selected" class="notes-calendar-cell__layer" data-layer="selected" aria-hidden="true" />
    <span v-if="isActive" class="notes-calendar-cell__layer" data-layer="active" aria-hidden="true" />
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
  position: relative;
  isolation: isolate;
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
  color: var(--journal-cell-today-color, var(--journal-saved-cell-today-color, var(--text-accent)));
}
.notes-calendar-cell[data-active] {
  color: var(--journal-cell-active-color, var(--journal-saved-cell-active-color, var(--text-on-accent)));
}
/* Raised here, not in the decoration: only this cell's isolated context has layers to clear, and
   z-index in the shared decoration would leak into every other host's stacking context. */
.notes-calendar-cell :deep(.cell-decoration__content) {
  position: relative;
  z-index: 2;
}
.notes-calendar-cell :deep(.cell-decoration__border),
.notes-calendar-cell :deep(.cell-marks),
.notes-calendar-cell :deep(.decoration-corner) {
  z-index: 2;
}
/* The isolated cell traps the popover's z-index, so later sibling cells would paint over its
   overhang; lift the whole cell while the popover is open. */
.notes-calendar-cell:has(.mark-overflow__popover) {
  z-index: var(--layer-popover);
}
/* The marks precede the label in the DOM, so at an equal z-index the label paints over a popover
   that overhangs the badge and takes the pointer, firing the badge's mouseleave. */
.notes-calendar-cell :deep(.cell-marks:has(.mark-overflow__popover)) {
  z-index: 3;
}
.notes-calendar-cell__layer {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
}
.notes-calendar-cell__layer[data-layer="today"] {
  background-color: var(--journal-cell-today-bg, var(--journal-saved-cell-today-bg, transparent));
  z-index: var(--journal-cell-today-layer, var(--journal-saved-cell-today-layer, -1));
}
/* Decoration marks sit MARK_INSET_PX (resolve-cell.ts) in from the edge to clear this ring;
   widening it means widening that too. */
.notes-calendar-cell__layer[data-layer="selected"] {
  box-shadow: inset 0 0 0 2px
    var(--journal-cell-selected-ring, var(--journal-saved-cell-selected-ring, var(--interactive-accent)));
  z-index: var(--journal-cell-selected-layer, var(--journal-saved-cell-selected-layer, 1));
}
.notes-calendar-cell__layer[data-layer="active"] {
  background-color: var(--journal-cell-active-bg, var(--journal-saved-cell-active-bg, var(--interactive-accent)));
  z-index: var(--journal-cell-active-layer, var(--journal-saved-cell-active-layer, -1));
}
</style>
