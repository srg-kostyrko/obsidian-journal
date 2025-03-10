<script setup lang="ts">
import type { JournalDecorationShape } from "@/types/settings.types";
import { colorToString } from "@/utils/color";
import { computed } from "vue";

const props = defineProps<{
  decoration: JournalDecorationShape;
}>();

const color = computed(() => colorToString(props.decoration.color));
const size = computed(() => `${props.decoration.size ?? 0.4}em`);
</script>

<template>
  <div class="shape-decoration" :class="[`shape-${decoration.shape}`]"></div>
</template>

<style scoped>
.shape-decoration {
  --size: v-bind(size);
}
.shape-circle {
  width: var(--size);
  height: var(--size);
  border-radius: 50%;
  background-color: v-bind(color);
}
.shape-square {
  width: var(--size);
  height: var(--size);
  background-color: v-bind(color);
}
.shape-triangle-up {
  width: 0;
  height: 0;
  border-left: calc(var(--size) * 0.5) solid transparent;
  border-right: calc(var(--size) * 0.5) solid transparent;
  border-bottom: var(--size) solid v-bind(color);
}
.shape-triangle-down {
  width: 0;
  height: 0;
  border-left: calc(var(--size) * 0.5) solid transparent;
  border-right: calc(var(--size) * 0.5) solid transparent;
  border-top: var(--size) solid v-bind(color);
}
.shape-triangle-left {
  width: 0;
  height: 0;
  border-top: calc(var(--size) * 0.5) solid transparent;
  border-bottom: calc(var(--size) * 0.5) solid transparent;
  border-right: var(--size) solid v-bind(color);
}
.shape-triangle-right {
  width: 0;
  height: 0;
  border-top: calc(var(--size) * 0.5) solid transparent;
  border-bottom: calc(var(--size) * 0.5) solid transparent;
  border-left: var(--size) solid v-bind(color);
}
</style>
