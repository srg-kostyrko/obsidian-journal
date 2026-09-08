<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";

import { capMarks } from "../cap-marks";
import { PLACEMENTS, type CellMark, type Placement } from "../resolve-cell";

import DecorationIcon from "./DecorationIcon.vue";
import DecorationShape from "./DecorationShape.vue";

const props = defineProps<{ marks: Readonly<Record<Placement, readonly CellMark[]>>; limit: number }>();

const capped = computed(() => capMarks(props.marks, props.limit));
const open = ref<Placement | null>(null);
</script>

<template>
  <span class="cell-marks">
    <template v-for="place of PLACEMENTS" :key="place">
      <span v-if="marks[place].length > 0" :class="`place place-${place}`">
        <span
          v-if="capped[place].hidden.length > 0"
          class="mark-overflow"
          data-testid="mark-overflow"
          aria-hidden="true"
          @mouseenter="open = place"
          @mouseleave="open = null"
        >
          {{ m.decoration_mark_overflow_badge({ count: capped[place].hidden.length }) }}
          <span v-if="open === place" class="mark-overflow__popover" data-testid="mark-overflow-popover">
            <template v-for="(d, i) of marks[place]" :key="i">
              <DecorationIcon v-if="d.type === 'icon'" :decoration="d" />
              <DecorationShape v-else :decoration="d" />
            </template>
          </span>
        </span>
        <template v-for="(d, i) of capped[place].visible" :key="i">
          <DecorationIcon v-if="d.type === 'icon'" :decoration="d" />
          <DecorationShape v-else :decoration="d" />
        </template>
      </span>
    </template>
  </span>
</template>

<style scoped>
.cell-marks {
  position: absolute;
  inset: 0;
  pointer-events: none;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
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

/* The mark grid is pointer-transparent so a click still reaches the cell underneath. The badge
   is the one thing in it that must receive hover, so it opts back in. */
.mark-overflow {
  pointer-events: auto;
  position: relative;
  flex: none;
  font-size: 0.55em;
  line-height: 1;
  font-weight: 600;
  padding: 1px 2px;
  border-radius: var(--radius-s);
  background-color: var(--background-modifier-border);
  color: var(--text-muted);
  cursor: default;
}
.mark-overflow__popover {
  position: absolute;
  z-index: var(--layer-popover);
  top: 100%;
  right: 0;
  margin-top: 2px;
  display: flex;
  gap: 4px;
  align-items: center;
  padding: var(--size-2-2) var(--size-2-3);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-s);
  background-color: var(--background-secondary);
  box-shadow: var(--shadow-s);
  font-size: 2em;
  white-space: nowrap;
}
</style>
