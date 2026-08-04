<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";

import type { JournalDecorationBorder } from "../../config";

export type BorderSideName = "top" | "right" | "bottom" | "left";

const props = defineProps<{ border?: JournalDecorationBorder; activeSide: BorderSideName }>();
defineEmits<{ chooseRing: []; chooseSide: [side: BorderSideName] }>();

const SIDES: readonly BorderSideName[] = ["top", "right", "bottom", "left"];

// An empty slot shows the ring, so the first click creates a linked border — the common case.
const linked = computed(() => props.border === undefined || props.border.border === "uniform");
</script>

<template>
  <div class="border-regions">
    <button
      v-if="linked"
      type="button"
      class="ring"
      :aria-label="m.decoration_canvas_region_label({ type: 'border' })"
      :aria-pressed="border !== undefined"
      @click="$emit('chooseRing')"
    />
    <template v-else>
      <button
        v-for="side of SIDES"
        :key="side"
        type="button"
        class="edge"
        :class="[`edge-${side}`, { 'edge-active': side === activeSide }]"
        :aria-label="m.decoration_border_side_label({ side })"
        :aria-pressed="border?.[side].show === true"
        @click="$emit('chooseSide', side)"
      />
    </template>
  </div>
</template>

<style scoped>
.border-regions {
  position: absolute;
  inset: 0;
}
.ring {
  position: absolute;
  inset: calc(-1 * var(--size-2-2));
  background-color: transparent;
  box-shadow: none;
  border: 1px dashed var(--background-modifier-border);
}
.ring[aria-pressed="true"] {
  border: 2px solid var(--interactive-accent);
}
.edge {
  position: absolute;
  background-color: transparent;
  box-shadow: none;
  border: 1px dashed var(--background-modifier-border);
}
.edge[aria-pressed="true"] {
  border-color: var(--interactive-accent);
}
.edge-active {
  border: 2px solid var(--interactive-accent);
}
.edge-top,
.edge-bottom {
  left: 15%;
  right: 15%;
  height: var(--size-4-3);
}
.edge-top {
  top: calc(-1 * var(--size-2-2));
}
.edge-bottom {
  bottom: calc(-1 * var(--size-2-2));
}
.edge-left,
.edge-right {
  top: 15%;
  bottom: 15%;
  width: var(--size-4-3);
}
.edge-left {
  left: calc(-1 * var(--size-2-2));
}
.edge-right {
  right: calc(-1 * var(--size-2-2));
}
</style>
