<script setup lang="ts">
import { computed, inject } from "vue";

import type { Period } from "@/calendar";

import { UNLIMITED_MARKS } from "../cap-marks";
import { cellKey } from "../engine";
import { formatPadding, resolveCell } from "../resolve-cell";

import {
  CellDecorationMapKey,
  CellMarkLimitKey,
  CellPaddingKey,
  type CellDecorationScope,
} from "./cell-decoration-map-key";
import CellMarks from "./CellMarks.vue";
import DecorationCorner from "./DecorationCorner.vue";

import type { JournalDecorationStyle } from "../config";

const props = defineProps<{ period: Period; scope?: CellDecorationScope }>();
const cells = inject(props.scope?.map ?? CellDecorationMapKey, null);
const sharedPadding = inject(props.scope?.padding ?? CellPaddingKey, null);

const styles = computed<readonly JournalDecorationStyle[]>(
  () => cells?.get(cellKey(props.period.kind, props.period.anchor.toAnchor()))?.value ?? [],
);

const cell = computed(() => resolveCell(styles.value));
// Named separately so the style block's v-bind() targets stay stable across re-resolves:
// the same resolved color keeps the same CSS custom property instead of churning it.
const background = computed(() => cell.value.background);
const textColor = computed(() => cell.value.textColor);
// Within a decorated grid every cell shares one reservation so a single decoration never
// inflates only its own row; standalone use (e.g. previews) falls back to its own styles.
const padding = computed(() => sharedPadding?.value ?? formatPadding(cell.value.padding));
// Absent when the component is mounted outside a decorated grid (a preview, a bare unit test),
// where nothing should be hidden.
const markLimit = inject(CellMarkLimitKey, null);
const limit = computed(() => markLimit?.value ?? UNLIMITED_MARKS);
</script>

<template>
  <span class="cell-decoration" data-testid="cell-decoration">
    <span
      class="cell-decoration__border"
      :style="{
        borderTop: cell.border.top,
        borderRight: cell.border.right,
        borderBottom: cell.border.bottom,
        borderLeft: cell.border.left,
      }"
    />
    <DecorationCorner v-for="(corner, i) in cell.corners" :key="i" :decoration="corner" />
    <CellMarks :marks="cell.marks" :limit="limit" />
    <span class="cell-decoration__content"><slot /></span>
  </span>
</template>

<style scoped>
.cell-decoration {
  width: 100%;
  height: 100%;
  padding: v-bind(padding);
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: v-bind(background) !important;
  color: v-bind(textColor) !important;
  line-height: 1;
  position: relative;
  box-sizing: border-box;
  /* The decoration paints over its whole host, so its fill and border have to follow whatever
     rounding the host has (rounded calendar cells, square nav blocks) instead of squaring it off. */
  border-radius: inherit;
}

.cell-decoration__border {
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
}

.cell-decoration__content {
  display: inline-block;
}
</style>
