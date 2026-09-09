<script setup lang="ts">
import { computed } from "vue";

import { UNLIMITED_MARKS } from "../cap-marks";
import { formatPadding, resolveCell } from "../resolve-cell";

import CellMarks from "./CellMarks.vue";
import DecorationCorner from "./DecorationCorner.vue";

import type { JournalDecorationStyle } from "../config";

const props = defineProps<{ styles: readonly JournalDecorationStyle[]; limit?: number }>();

const cell = computed(() => resolveCell(props.styles));
// Named separately so the style block's v-bind() targets stay stable across re-resolves:
// the same resolved color keeps the same CSS custom property instead of churning it.
const background = computed(() => cell.value.background);
const textColor = computed(() => cell.value.textColor);
const padding = computed(() => formatPadding(cell.value.padding));
</script>

<template>
  <span class="decoration-preview" data-testid="decoration-preview">
    <span
      class="decoration-preview__border"
      :style="{
        borderTop: cell.border.top,
        borderRight: cell.border.right,
        borderBottom: cell.border.bottom,
        borderLeft: cell.border.left,
      }"
    />
    <DecorationCorner v-for="(corner, i) in cell.corners" :key="i" :decoration="corner" />
    <CellMarks :marks="cell.marks" :limit="limit ?? UNLIMITED_MARKS" />
    <span class="decoration-preview__content"><slot /></span>
  </span>
</template>

<style scoped>
.decoration-preview {
  padding: v-bind(padding);
  display: inline-flex;
  justify-content: center;
  align-items: center;
  background-color: v-bind(background) !important;
  color: v-bind(textColor) !important;
  line-height: 1;
  position: relative;
  box-sizing: border-box;
  min-width: 2em;
  min-height: 2em;
}
.decoration-preview__border {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.decoration-preview__content {
  display: inline-block;
}
</style>
