<script setup lang="ts">
defineProps<{
  placeholder?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  narrow?: boolean;
}>();

const model = defineModel<number>();
</script>

<template>
  <input
    v-model="model"
    type="number"
    :class="{ 'narrow-input': narrow }"
    :placeholder="placeholder"
    :disabled="disabled"
    :min="min"
    :max="max"
    :step="step"
    spellcheck="false"
  />
</template>

<style scoped>
.narrow-input {
  width: 60px;
}
</style>
