<script setup lang="ts">
defineProps<{
  placeholder?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
}>();

const model = defineModel<number>();
</script>

<template>
  <input
    v-model="model"
    type="number"
    :placeholder="placeholder"
    :disabled="disabled"
    :min="min"
    :max="max"
    spellcheck="false"
  />
</template>
