<script setup lang="ts">
import { computed, inject } from "vue";

import type { Period } from "@/calendar";

import {
  backgroundFrom,
  borderStylesFrom,
  cornersFrom,
  paddingFrom,
  placedFrom,
  textColorFrom,
} from "../derive-styles";
import { cellKey } from "../engine";

import { CellDecorationMapKey, CellPaddingKey, type CellDecorationScope } from "./cell-decoration-map-key";
import DecorationCorner from "./DecorationCorner.vue";
import DecorationIcon from "./DecorationIcon.vue";
import DecorationShape from "./DecorationShape.vue";

import type { JournalDecorationStyle } from "../config";

const props = defineProps<{ period: Period; scope?: CellDecorationScope }>();
const cells = inject(props.scope?.map ?? CellDecorationMapKey, null);
const sharedPadding = inject(props.scope?.padding ?? CellPaddingKey, null);

const styles = computed<readonly JournalDecorationStyle[]>(
  () => cells?.get(cellKey(props.period.kind, props.period.anchor.toAnchor()))?.value ?? [],
);

const background = computed(() => backgroundFrom(styles.value));
const textColor = computed(() => textColorFrom(styles.value));
const border = computed(() => borderStylesFrom(styles.value));
// Within a decorated grid every cell shares one reservation so a single decoration never
// inflates only its own row; standalone use (e.g. previews) falls back to its own styles.
const padding = computed(() => sharedPadding?.value ?? paddingFrom(styles.value));
const corners = computed(() => cornersFrom(styles.value));
const placed = computed(() => placedFrom(styles.value));
</script>

<template>
  <span class="cell-decoration" data-testid="cell-decoration">
    <span class="cell-decoration__border" :style="border" />
    <DecorationCorner v-for="(corner, i) in corners" :key="i" :decoration="corner" />
    <span class="cell-decoration__placed">
      <template v-for="(group, key) in placed" :key="key">
        <span v-if="group.length > 0" :class="`place place-${key}`">
          <template v-for="(d, i) in group" :key="i">
            <DecorationIcon v-if="d.type === 'icon'" :decoration="d" />
            <DecorationShape v-else :decoration="d" />
          </template>
        </span>
      </template>
    </span>
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
}

.cell-decoration__border {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.cell-decoration__placed {
  position: absolute;
  inset: 0;
  pointer-events: none;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
}

.cell-decoration__content {
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
