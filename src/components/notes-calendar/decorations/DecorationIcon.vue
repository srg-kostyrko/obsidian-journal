<script setup lang="ts">
import ObsidianIcon from "@/components/obsidian/ObsidianIcon.vue";
import type { JournalDecorationIcon } from "@/types/settings.types";
import { colorToString } from "@/utils/color";
import { computed } from "vue";

const props = defineProps<{
  decoration: JournalDecorationIcon;
}>();

const color = computed(() => colorToString(props.decoration.color));
const size = computed(() => `${props.decoration.size ?? 0.5}em`);
</script>

<template>
  <ObsidianIcon :name="decoration.icon" class="icon-decoration" />
</template>

<style scoped>
.icon-decoration {
  display: block;
  color: v-bind(color);
  --size: v-bind(size);
  --icon-size: v-bind(size);
  width: var(--size);
  height: var(--size);
}
.icon-decoration :deep(svg) {
  display: block;
}
</style>
