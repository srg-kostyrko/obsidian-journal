<script setup lang="ts">
import ObsidianButton from "./ObsidianButton.vue";
import ObsidianIcon from "./ObsidianIcon.vue";

defineProps<{
  icon: string;
  tooltip?: string;
}>();
</script>

<template>
  <ObsidianButton :tooltip="tooltip" flat class="icon-button">
    <ObsidianIcon :name="icon" />
  </ObsidianButton>
</template>

<style scoped>
.icon-button {
  padding: var(--size-4-1) var(--size-4-2);
}
</style>
