<script setup lang="ts" generic="T extends JournalDecorationsStyle">
import type { JournalDecorationsStyle } from "@/types/settings.types";
import { computed, type Component } from "vue";
import DecorationBackground from "./DecorationBackground.vue";
import DecorationColor from "./DecorationColor.vue";
import DecorationShape from "./DecorationShape.vue";
import DecorationCorner from "./DecorationCorner.vue";
import DecorationIcon from "./DecorationIcon.vue";
import DecorationBorder from "./DecorationBorder.vue";

const { decoration } = defineProps<{ decoration: T }>();
defineEmits<
  <K extends keyof T>(
    event: "change",
    change: {
      prop: K;
      value: T[K];
    },
  ) => void
>();

const component = computed((): Component<{ decoration: T }> | null => {
  switch (decoration.type) {
    case "background": {
      return DecorationBackground as Component<{ decoration: T }>;
    }
    case "color": {
      return DecorationColor as Component<{ decoration: T }>;
    }
    case "shape": {
      return DecorationShape as Component<{ decoration: T }>;
    }
    case "corner": {
      return DecorationCorner as Component<{ decoration: T }>;
    }
    case "icon": {
      return DecorationIcon as Component<{ decoration: T }>;
    }
    case "border": {
      return DecorationBorder as Component<{ decoration: T }>;
    }
  }
  return null;
});
</script>

<template>
  <component :is="component" :decoration="decoration" @change="$emit('change', $event)" />
</template>
