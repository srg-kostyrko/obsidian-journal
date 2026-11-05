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
  outside?: boolean;
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
const states = computed(() =>
  (
    [
      ["outside", props.outside],
      ["today", isToday.value],
      ["selected", props.selected],
      ["active", isActive.value],
    ] as const
  )
    .filter(([, applies]) => applies)
    .map(([state]) => state),
);
// The open note's fill replaces today's, as it did before layers existed; today's ring stays.
const fills = computed(() => states.value.filter((state) => state !== "today" || !isActive.value));
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
    :data-outside="outside || null"
    @click="cell.open(rawPeriod, $event)"
    @auxclick.middle.prevent="cell.open(rawPeriod, $event)"
    @keydown.enter="cell.open(rawPeriod, $event)"
    @keydown.space.prevent="cell.open(rawPeriod, $event)"
    @contextmenu.prevent="cell.openContextMenu(rawPeriod, $event)"
    @mouseenter="hover.enter($event, (event) => cell.openPreview(rawPeriod, event))"
    @mouseleave="hover.leave()"
  >
    <!-- Every fill before every ring, so no state's fill can hide another state's ring. -->
    <span
      v-for="state in fills"
      :key="`${state}-fill`"
      class="notes-calendar-cell__layer"
      :data-layer="`${state}-fill`"
      aria-hidden="true"
    />
    <span
      v-for="state in states"
      :key="`${state}-ring`"
      class="notes-calendar-cell__layer"
      :data-layer="`${state}-ring`"
      aria-hidden="true"
    />
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
/* Text precedence, highest first: open note, selected, today, outside. Each applicable state sets its
   private value with no fallback, so an unset value is guaranteed-invalid
   and the chain falls through to the next. A state whose value is currentColor still wins: that is
   how "unchanged" and "none" cancel a stock color, at the cost of blocking lower states. */
.notes-calendar-cell[data-outside] {
  --_text-outside: var(
    --journal-cell-outside-text-color,
    var(--journal-saved-cell-outside-text-color, var(--text-muted))
  );
  --_weight-outside: var(--journal-cell-outside-text-weight, var(--journal-saved-cell-outside-text-weight));
  --_italic-outside: var(--journal-cell-outside-text-italic, var(--journal-saved-cell-outside-text-italic));
  --_over-outside: calc(
    clamp(0, var(--journal-cell-outside-layer, var(--journal-saved-cell-outside-layer, -1)), 1) * 100%
  );
}
.notes-calendar-cell[data-today] {
  --_text-today: var(--journal-cell-today-text-color, var(--journal-saved-cell-today-text-color, var(--text-accent)));
  --_weight-today: var(--journal-cell-today-text-weight, var(--journal-saved-cell-today-text-weight));
  --_italic-today: var(--journal-cell-today-text-italic, var(--journal-saved-cell-today-text-italic));
  --_over-today: calc(clamp(0, var(--journal-cell-today-layer, var(--journal-saved-cell-today-layer, -1)), 1) * 100%);
}
.notes-calendar-cell[data-selected] {
  --_text-selected: var(--journal-cell-selected-text-color, var(--journal-saved-cell-selected-text-color));
  --_weight-selected: var(--journal-cell-selected-text-weight, var(--journal-saved-cell-selected-text-weight));
  --_italic-selected: var(--journal-cell-selected-text-italic, var(--journal-saved-cell-selected-text-italic));
  --_over-selected: calc(
    clamp(0, var(--journal-cell-selected-layer, var(--journal-saved-cell-selected-layer, 1)), 1) * 100%
  );
}
.notes-calendar-cell[data-active] {
  --_text-active: var(
    --journal-cell-active-text-color,
    var(--journal-saved-cell-active-text-color, var(--text-on-accent))
  );
  --_weight-active: var(--journal-cell-active-text-weight, var(--journal-saved-cell-active-text-weight));
  --_italic-active: var(--journal-cell-active-text-italic, var(--journal-saved-cell-active-text-italic));
  --_over-active: calc(
    clamp(0, var(--journal-cell-active-layer, var(--journal-saved-cell-active-layer, -1)), 1) * 100%
  );
}
.notes-calendar-cell:is([data-outside], [data-today], [data-selected], [data-active]) {
  color: var(--_text-active, var(--_text-selected, var(--_text-today, var(--_text-outside))));
}
/* Raised here, not in the decoration: only this cell's isolated context has layers to clear, and
   z-index in the shared decoration would leak into every other host's stacking context. The border
   is left out on purpose: it is decoration, not content, so the selected ring paints above it.
   Marks and corners sit above the label, as positioned marks sat above the static label before
   layers existed: the content follows the marks in the DOM, so at an equal z-index the label would
   take the pointer from an overflow badge it overlaps. */
.notes-calendar-cell :deep(.cell-decoration__content) {
  position: relative;
  z-index: 2;
}
/* A decoration paints its text color with !important on the element around the label, which beats
   the cell's color, so a state set over decorations (its layer above 0) re-paints the label itself.
   The layer clamps to a 0%/100% weight: under, the mix passes the inherited decoration color through;
   over, it takes the state's text. States nest in text precedence, the highest outermost, and a state
   with no text color passes the lower states' result through rather than blocking it. Weight and
   italic are set here rather than on the cell, where an unset chain would unset the week number's
   bold; here it only inherits. */
.notes-calendar-cell:is([data-outside], [data-today], [data-selected], [data-active]) :deep(.cell-decoration__content) {
  --_over-outside-text: color-mix(in srgb, var(--_text-outside, currentColor) var(--_over-outside, 0%), currentColor);
  --_over-today-text: color-mix(
    in srgb,
    var(--_text-today, var(--_over-outside-text)) var(--_over-today, 0%),
    var(--_over-outside-text)
  );
  --_over-selected-text: color-mix(
    in srgb,
    var(--_text-selected, var(--_over-today-text)) var(--_over-selected, 0%),
    var(--_over-today-text)
  );
  color: color-mix(
    in srgb,
    var(--_text-active, var(--_over-selected-text)) var(--_over-active, 0%),
    var(--_over-selected-text)
  );
  font-weight: var(--_weight-active, var(--_weight-selected, var(--_weight-today, var(--_weight-outside))));
  font-style: var(--_italic-active, var(--_italic-selected, var(--_italic-today, var(--_italic-outside))));
}
.notes-calendar-cell :deep(.cell-marks),
.notes-calendar-cell :deep(.decoration-corner) {
  z-index: 3;
}
/* The isolated cell traps the popover's z-index, so later sibling cells would paint over its
   overhang; lift the whole cell while the popover is open. */
.notes-calendar-cell:has(.mark-overflow__popover) {
  z-index: var(--layer-popover);
}
.notes-calendar-cell__layer {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
}
.notes-calendar-cell__layer[data-layer^="outside-"] {
  --_color: var(--journal-cell-outside-color, var(--journal-saved-cell-outside-color, transparent));
  --_strength: var(--journal-cell-outside-strength, var(--journal-saved-cell-outside-strength, 0%));
  --_ring-width: var(--journal-cell-outside-ring-width, var(--journal-saved-cell-outside-ring-width, 0px));
  z-index: var(--journal-cell-outside-layer, var(--journal-saved-cell-outside-layer, -1));
}
.notes-calendar-cell__layer[data-layer^="today-"] {
  --_color: var(--journal-cell-today-color, var(--journal-saved-cell-today-color, transparent));
  --_strength: var(--journal-cell-today-strength, var(--journal-saved-cell-today-strength, 0%));
  --_ring-width: var(--journal-cell-today-ring-width, var(--journal-saved-cell-today-ring-width, 0px));
  z-index: var(--journal-cell-today-layer, var(--journal-saved-cell-today-layer, -1));
}
.notes-calendar-cell__layer[data-layer^="selected-"] {
  --_color: var(--journal-cell-selected-color, var(--journal-saved-cell-selected-color, var(--interactive-accent)));
  --_strength: var(--journal-cell-selected-strength, var(--journal-saved-cell-selected-strength, 0%));
  --_ring-width: var(--journal-cell-selected-ring-width, var(--journal-saved-cell-selected-ring-width, 2px));
  z-index: var(--journal-cell-selected-layer, var(--journal-saved-cell-selected-layer, 1));
}
.notes-calendar-cell__layer[data-layer^="active-"] {
  --_color: var(--journal-cell-active-color, var(--journal-saved-cell-active-color, var(--interactive-accent)));
  --_strength: var(--journal-cell-active-strength, var(--journal-saved-cell-active-strength, 100%));
  --_ring-width: var(--journal-cell-active-ring-width, var(--journal-saved-cell-active-ring-width, 0px));
  z-index: var(--journal-cell-active-layer, var(--journal-saved-cell-active-layer, -1));
}
.notes-calendar-cell__layer[data-layer$="-fill"] {
  background-color: color-mix(in srgb, var(--_color) var(--_strength), transparent);
}
/* Decoration marks sit MARK_INSET_PX (resolve-cell.ts) in from the edge to clear the stock selected
   ring; widening it means widening that too. */
.notes-calendar-cell__layer[data-layer$="-ring"] {
  box-shadow: inset 0 0 0 var(--_ring-width) var(--_color);
}
</style>
