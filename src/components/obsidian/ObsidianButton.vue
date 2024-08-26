<script setup lang="ts">
defineProps<{
  disabled?: boolean;
  cta?: boolean;
  warning?: boolean;
  type?: "button" | "submit" | "reset";
  tooltip?: string;
}>();
</script>

<template>
  <button
    :class="{ 'mod-cta': cta, 'mod-warning': warning }"
    :disabled="disabled"
    :type="type ?? 'button'"
    :aria-label="tooltip"
  >
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
