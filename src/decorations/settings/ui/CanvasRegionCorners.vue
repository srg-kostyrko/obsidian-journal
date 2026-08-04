<script setup lang="ts">
import { m } from "@/i18n";

import type { JournalDecorationCorner } from "../../config";

type Placement = JournalDecorationCorner["placement"];

defineProps<{ occupied?: Placement }>();
defineEmits<{ choose: [placement: Placement] }>();

const PLACEMENTS: readonly Placement[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
</script>

<template>
  <div class="corner-regions">
    <button
      v-for="placement of PLACEMENTS"
      :key="placement"
      type="button"
      class="corner"
      :class="`corner-${placement}`"
      :aria-label="m.decoration_corner_placement_label({ placement })"
      :aria-pressed="occupied === placement"
      @click="$emit('choose', placement)"
    />
  </div>
</template>

<style scoped>
.corner-regions {
  position: absolute;
  inset: 0;
}
.corner {
  position: absolute;
  width: 33%;
  height: 33%;
  background-color: transparent;
  box-shadow: none;
  border: 1px dashed var(--background-modifier-border);
}
.corner:hover {
  background-color: var(--background-modifier-hover);
}
.corner[aria-pressed="true"] {
  border: 2px solid var(--interactive-accent);
}
.corner-top-left {
  top: 0;
  left: 0;
}
.corner-top-right {
  top: 0;
  right: 0;
}
.corner-bottom-left {
  bottom: 0;
  left: 0;
}
.corner-bottom-right {
  bottom: 0;
  right: 0;
}
</style>
