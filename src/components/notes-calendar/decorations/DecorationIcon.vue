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
  <ObsidianIcon
    :name="decoration.icon"
    class="icon-decoration"
    :class="`x-${decoration.placement_x} y-${decoration.placement_y}`"
  />
</template>

<style scoped>
.icon-decoration {
  display: block;
  position: absolute;
  color: v-bind(color);
  --size: 0.3em;
  --icon-size: 0.3em;
  width: var(--size);
  height: var(--size);
}
.icon-decoration :deep(svg) {
  display: block;
}
.x-left {
  left: 0;
}
.x-center {
  left: 50%;
  margin-left: calc(var(--size) * -0.5);
}
.x-right {
  right: 0;
}
.y-top {
  top: 0;
}
.y-middle {
  top: 50%;
  margin-top: calc(var(--size) * -0.5);
}
.y-bottom {
  bottom: 0;
}
</style>
