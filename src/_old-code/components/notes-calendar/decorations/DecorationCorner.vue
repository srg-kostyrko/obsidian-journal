<script setup lang="ts">
import type { JournalDecorationCorner } from "@/types/settings.types";
import { colorToString } from "@/utils/color";
import { computed } from "vue";

const props = defineProps<{
  decoration: JournalDecorationCorner;
}>();

const color = computed(() => colorToString(props.decoration.color));
</script>

<template>
  <div class="decoration-corner" :class="[decoration.placement]"></div>
</template>

<style scoped>
.decoration-corner {
  position: absolute;
  width: 0;
  height: 0;
  --size: 0.6em;
}
.top-left {
  top: 0;
  left: 0;
  border-top: var(--size) solid v-bind(color);
  border-right: var(--size) solid transparent;
}
.top-right {
  top: 0;
  right: 0;
  border-top: var(--size) solid v-bind(color);
  border-left: var(--size) solid transparent;
}
.bottom-left {
  bottom: 0;
  left: 0;
  border-bottom: var(--size) solid v-bind(color);
  border-right: var(--size) solid transparent;
}
.bottom-right {
  bottom: 0;
  right: 0;
  border-bottom: var(--size) solid v-bind(color);
  border-left: var(--size) solid transparent;
}
</style>
