<script setup lang="ts">
defineProps<{ disabled?: boolean; clickable?: boolean }>();
</script>

<template>
  <button :disabled :class="{ clickable }">
    <slot />
  </button>
</template>

<style scoped>
button {
  background-color: transparent !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  height: auto;
  padding: 0 !important;
}
.clickable {
  cursor: pointer;
}
button:disabled {
  cursor: not-allowed;
}
</style>
