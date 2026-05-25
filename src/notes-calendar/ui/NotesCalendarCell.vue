<script setup lang="ts">
import { computed, toRaw } from "vue";

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
</script>

<template>
  <span
    class="notes-calendar-cell"
    :data-active="isActive || null"
    :data-inactive="isInactive || null"
    @contextmenu.prevent="cell.openContextMenu(rawPeriod, $event)"
    @mouseenter="cell.openPreview(rawPeriod, $event)"
  >
    <CellDecoration :period="rawPeriod">{{ label }}</CellDecoration>
  </span>
</template>
