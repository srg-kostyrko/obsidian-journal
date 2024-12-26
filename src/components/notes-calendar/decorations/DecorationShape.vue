<script setup lang="ts">
import type { JournalDecorationShape } from "@/types/settings.types";
import { colorToString } from "@/utils/color";
import { computed } from "vue";

const props = defineProps<{
  decoration: JournalDecorationShape;
}>();

const color = computed(() => colorToString(props.decoration.color));
</script>

<template>
  <div
    class="shape-decoration"
    :class="[`shape-${decoration.shape} x-${decoration.placement_x} y-${decoration.placement_y}`]"
  ></div>
</template>

<style scoped>
.shape-decoration {
  position: absolute;
  --size: 0.4em;
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
