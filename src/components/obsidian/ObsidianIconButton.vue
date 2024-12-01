<script setup lang="ts">
import ObsidianButton from "./ObsidianButton.vue";
import ObsidianIcon from "./ObsidianIcon.vue";

defineProps<{
  icon: string;
  tooltip?: string;
}>();
const emit = defineEmits(["click"]);
</script>

<template>
  <ObsidianButton :tooltip="tooltip" flat class="icon-button">
    <ObsidianIcon :name="icon" @click="emit('click')" />
  </ObsidianButton>
</template>

<style scoped>
.icon-button {
  padding: var(--size-4-1) var(--size-4-2);
}
</style>
