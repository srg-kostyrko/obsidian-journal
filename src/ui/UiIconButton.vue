<script setup lang="ts">
import UiButton from "./UiButton.vue";
import UiIcon from "./UiIcon.vue";

defineProps<{
  icon: string;
  tooltip?: string;
}>();
</script>

<template>
  <UiButton :tooltip="tooltip" flat class="icon-button">
    <UiIcon :name="icon" />
  </UiButton>
</template>

<style scoped>
.icon-button {
  padding: var(--size-4-1) var(--size-4-2);
}
</style>
