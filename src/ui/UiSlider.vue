<script setup lang="ts">
defineProps<{
  min: number;
  max: number;
  step: number;
  label?: string;
  disabled?: boolean;
}>();

const model = defineModel<number>({ required: true });
</script>

<template>
  <input
    v-model.number="model"
    type="range"
    class="slider"
    :min="min"
    :max="max"
    :step="step"
    :aria-label="label"
    :disabled="disabled"
  />
</template>
