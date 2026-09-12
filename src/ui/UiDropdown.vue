<script setup lang="ts">
defineProps<{
  disabled?: boolean;
}>();
const model = defineModel<string>({ default: "" });
</script>

<template>
  <select v-model="model" class="dropdown" :disabled="disabled">
    <slot />
  </select>
</template>
