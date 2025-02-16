<script setup lang="ts">
import ObsidianIcon from "@/components/obsidian/ObsidianIcon.vue";
import type { JournalDecorationIcon } from "@/types/settings.types";
import { colorToString } from "@/utils/color";
import { computed } from "vue";

const props = defineProps<{
  decoration: JournalDecorationIcon;
}>();

const color = computed(() => colorToString(props.decoration.color));
</script>

<template>
  <ObsidianIcon :name="decoration.icon" class="icon-decoration" />
</template>

<style scoped>
.icon-decoration {
  display: block;
  color: v-bind(color);
  --size: 0.3em;
  --icon-size: 0.3em;
  width: var(--size);
  height: var(--size);
}
.icon-decoration :deep(svg) {
  display: block;
}
</style>
