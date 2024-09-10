<script setup lang="ts">
defineProps<{
  disabled?: boolean;
  cta?: boolean;
  warning?: boolean;
  type?: "button" | "submit" | "reset";
  tooltip?: string;
  flat?: boolean;
}>();
</script>

<template>
  <button
    :class="{ 'mod-cta': cta, 'mod-warning': warning, 'clickable-icon': flat && !cta }"
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
