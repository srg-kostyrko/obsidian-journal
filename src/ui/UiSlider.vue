<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  min: number;
  max: number;
  step: number;
  label?: string;
  disabled?: boolean;
}>();

const model = defineModel<number>({ required: true });

// Obsidian's own slider sets this from script and its CSS draws the fill from it; a bare range
// input never does, so the fill would stay at the start of the track.
const fill = computed(() => {
  const span = props.max - props.min;
  const ratio = span > 0 ? (model.value - props.min) / span : 0;
  return { "--slider-fill-ratio": String(Math.min(1, Math.max(0, ratio))) };
});
</script>

<template>
  <input
    v-model.number="model"
    type="range"
    class="slider"
    :style="fill"
    :min="min"
    :max="max"
    :step="step"
    :aria-label="label"
    :disabled="disabled"
  />
</template>
