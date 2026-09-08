<script setup lang="ts">
import { PLACEMENTS, type CellMark, type Placement } from "../resolve-cell";

import DecorationIcon from "./DecorationIcon.vue";
import DecorationShape from "./DecorationShape.vue";

defineProps<{ marks: Readonly<Record<Placement, readonly CellMark[]>>; limit: number }>();
</script>

<template>
  <span class="cell-marks">
    <template v-for="place of PLACEMENTS" :key="place">
      <span v-if="marks[place].length > 0" :class="`place place-${place}`">
        <template v-for="(d, i) of marks[place]" :key="i">
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
</style>
