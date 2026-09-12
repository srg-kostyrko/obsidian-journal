<script setup lang="ts">
defineProps<{
  placeholder?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  narrow?: boolean;
}>();

// A blank number field is a real state, and callers bind config values that can be unset, so
// there is no numeric default that would not invent a value the parent never chose.
const model = defineModel<number | undefined>({ default: undefined });
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
