<script setup lang="ts">
import { computed } from "vue";

import { formatPadding, resolveCell } from "../resolve-cell";

import DecorationCorner from "./DecorationCorner.vue";
import DecorationIcon from "./DecorationIcon.vue";
import DecorationShape from "./DecorationShape.vue";

import type { JournalDecorationStyle } from "../config";

const props = defineProps<{ styles: readonly JournalDecorationStyle[] }>();

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
    <span class="decoration-preview__placed">
      <template v-for="(group, key) in cell.marks" :key="key">
        <span v-if="group.length > 0" :class="`place place-${key}`">
          <template v-for="(d, i) in group" :key="i">
            <DecorationIcon v-if="d.type === 'icon'" :decoration="d" />
            <DecorationShape v-else :decoration="d" />
          </template>
        </span>
      </template>
    </span>
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
.decoration-preview__placed {
  position: absolute;
  inset: 0;
  pointer-events: none;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
}
.decoration-preview__content {
  display: inline-block;
}
.place {
  display: flex;
  gap: 2px;
}
.place-left_top {
  grid-area: 1/1;
  justify-content: flex-start;
  align-items: flex-start;
  padding: 1px 0 0 1px;
}
.place-left_middle {
  grid-area: 2/1;
  justify-content: flex-start;
  align-items: center;
}
.place-left_bottom {
  grid-area: 3/1;
  justify-content: flex-start;
  align-items: flex-end;
  padding: 0 0 1px 1px;
}
.place-center_top {
  grid-area: 1/2;
  justify-content: center;
  align-items: flex-start;
}
.place-center_middle {
  grid-area: 2/2;
  justify-content: center;
  align-items: center;
}
.place-center_bottom {
  grid-area: 3/2;
  justify-content: center;
  align-items: flex-end;
}
.place-right_top {
  grid-area: 1/3;
  justify-content: flex-end;
  align-items: flex-start;
  padding: 1px 1px 0 0;
}
.place-right_middle {
  grid-area: 2/3;
  justify-content: flex-end;
  align-items: center;
}
.place-right_bottom {
  grid-area: 3/3;
  justify-content: flex-end;
  align-items: flex-end;
  padding: 0 1px 1px 0;
}
</style>
