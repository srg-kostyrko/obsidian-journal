<script setup lang="ts">
import { computed, toRaw } from "vue";

import { CalendarDate } from "@/calendar";
import type { Period } from "@/calendar";
import { CellDecoration } from "@/decorations";

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
</script>

<template>
  <span
    class="notes-calendar-cell"
    :data-active="isActive || null"
    :data-inactive="isInactive || null"
    :data-today="isToday || null"
    @contextmenu.prevent="cell.openContextMenu(rawPeriod, $event)"
    @mouseenter="cell.openPreview(rawPeriod, $event)"
  >
    <CellDecoration :period="rawPeriod">{{ label }}</CellDecoration>
  </span>
</template>

<style scoped>
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
