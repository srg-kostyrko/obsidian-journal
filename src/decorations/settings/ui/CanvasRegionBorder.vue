<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";

import type { JournalDecorationBorder } from "../../config";
import type { BorderSideName } from "../../resolve-cell";

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
  /* Obsidian's `button` ships a fixed height, which outranks `inset` and would leave the
     ring a 30px strip across the top of the cell. Same for the two vertical edges below.
     Its rounded corners would make each edge read as a pill rather than a cell edge. */
  height: auto;
  border-radius: 0;
  background-color: transparent;
  box-shadow: none;
  border: 1px dashed var(--background-modifier-border);
}
/* A halo outside the region, rather than the fill every other region uses. Two reasons: the
   ring covers the whole cell, so filling it would tint the preview and hide the colors being
   judged; and a shown side already draws itself in the accent, so a hover that only restyled
   the border would be invisible on exactly the regions that are already there. */
.ring:hover,
.edge:hover {
  outline: 2px solid var(--text-accent);
  outline-offset: 2px;
}
.ring[aria-pressed="true"] {
  border: 2px solid var(--interactive-accent);
}
.edge {
  position: absolute;
  border-radius: 0;
  background-color: transparent;
  box-shadow: none;
  border: 1px dashed var(--background-modifier-border);
}
/* An edge is drawn 12px thick to read as a side rather than a band, which is under half the
   target a pointer wants. The slop is claimed invisibly instead of by drawing it fatter; the
   four edges stand clear of each other at the corners, so none of them overlap. */
.edge::before {
  content: "";
  position: absolute;
  inset: calc(-1 * var(--size-4-2));
}
/* An edge sits in the margin outside the cell, so unlike the ring it can also fill without
   covering anything the user is judging. */
.edge:hover {
  background-color: var(--background-modifier-active-hover);
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
  height: auto;
  width: var(--size-4-3);
}
.edge-left {
  left: calc(-1 * var(--size-2-2));
}
.edge-right {
  right: calc(-1 * var(--size-2-2));
}
</style>
