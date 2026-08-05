<script setup lang="ts">
import { m } from "@/i18n";

import type { Placement } from "../../resolve-cell";

defineProps<{ occupied?: Placement }>();
defineEmits<{ choose: [placement: Placement] }>();

const PLACEMENTS: readonly Placement[] = [
  "left_top",
  "center_top",
  "right_top",
  "left_middle",
  "center_middle",
  "right_middle",
  "left_bottom",
  "center_bottom",
  "right_bottom",
];
</script>

<template>
  <div class="slot-grid">
    <button
      v-for="placement of PLACEMENTS"
      :key="placement"
      type="button"
      class="slot"
      :aria-label="m.decoration_canvas_slot_label({ slot: placement })"
      :aria-pressed="occupied === placement"
      @click="$emit('choose', placement)"
    />
  </div>
</template>

<style scoped>
.slot-grid {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
}
.slot {
  /* Obsidian's `button` ships a fixed height, so without this each slot collapses to a
     30px strip at the top of its grid row instead of filling it. Its rounded corners
     would break the grid the nine slots are meant to read as. */
  height: 100%;
  border-radius: 0;
  border: 1px dashed var(--background-modifier-border);
  background-color: transparent;
  box-shadow: none;
}
.slot:hover {
  background-color: var(--background-modifier-hover);
}
.slot[aria-pressed="true"] {
  border: 2px solid var(--interactive-accent);
}
</style>
