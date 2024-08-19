<script setup lang="ts">
defineProps<{
  disabled?: boolean;
  cta?: boolean;
  warning?: boolean;
}>();
</script>

<template>
  <button :class="{ 'mod-cta': cta, 'mod-warning': warning }" :disabled="disabled">
    <slot />
  </button>
</template>

<style scoped>
button {
  cursor: pointer;
}
button:disabled {
  cursor: not-allowed;
}
</style>
