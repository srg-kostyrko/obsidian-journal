<script setup lang="ts">
import { computed } from "vue";

import UiIcon from "@/ui/UiIcon.vue";

import { colorToString } from "./color";

import type { JournalDecorationIcon } from "../config";

const props = defineProps<{ decoration: JournalDecorationIcon }>();

const color = computed(() => colorToString(props.decoration.color));
const size = computed(() => `${props.decoration.size}em`);
</script>

<template>
  <UiIcon :name="decoration.icon" class="icon-decoration" />
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
