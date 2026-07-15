<script setup lang="ts">
import { computed, toRaw } from "vue";

import { CalendarDate } from "@/calendar";
import type { Period } from "@/calendar";
import { CellDecoration } from "@/decorations";
import { useModifierHoverPreview } from "@/ui/use-modifier-hover-preview";

import { defaultFormatPattern } from "../cell-format";

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

const hover = useModifierHoverPreview();
</script>

<template>
  <span
    class="notes-calendar-cell"
    :role="isInactive ? undefined : 'button'"
    :tabindex="isInactive ? undefined : 0"
    :data-active="isActive || null"
    :data-inactive="isInactive || null"
    :data-anchor="rawPeriod.anchor.toAnchor()"
    :data-today="isToday || null"
    @click="cell.open(rawPeriod, $event)"
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
/* [data-today] follows [data-active] so a cell that is both resolves to the today colors. */
.notes-calendar-cell[data-active] {
  color: var(--journal-cell-active-color);
  background-color: var(--journal-cell-active-bg);
}
.notes-calendar-cell[data-today] {
  color: var(--journal-cell-today-color);
  background-color: var(--journal-cell-today-bg);
}
</style>
