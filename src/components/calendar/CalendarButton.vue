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
  background-color: transparent;
  box-shadow: none;
}
.clickable {
  cursor: pointer;
}
</style>
