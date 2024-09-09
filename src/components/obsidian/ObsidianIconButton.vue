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
  <ObsidianButton :tooltip="tooltip">
    <ObsidianIcon :name="icon" @click="emit('click')" />
  </ObsidianButton>
</template>
