<script setup lang="ts">
import type { BorderSettings, JournalDecorationsStyle } from "@/types/settings.types";
import { computed } from "vue";
import DecorationShape from "./DecorationShape.vue";
import DecorationCorner from "./DecorationCorner.vue";
import DecorationIcon from "./DecorationIcon.vue";

const props = defineProps<{ styles: JournalDecorationsStyle[] }>();

const background = computed(() => {
  const decoration = props.styles.find((d) => d.type === "background");
  if (!decoration) return "inherit";
  return decoration.color;
});
const textColor = computed(() => {
  const decoration = props.styles.find((d) => d.type === "color");
  if (!decoration) return "inherit";
  return decoration.color;
});

const shapeDecorations = computed(() => props.styles.filter((d) => d.type === "shape"));
const cornerDecorations = computed(() => props.styles.filter((d) => d.type === "corner"));
const iconDecorations = computed(() => props.styles.filter((d) => d.type === "icon"));

const borderDecorations = computed(() => props.styles.filter((d) => d.type === "border"));
const borderStyle = computed(() => {
  const style = {
    borderTop: "none",
    borderBottom: "none",
    borderLeft: "none",
    borderRight: "none",
  };

  for (const decoration of borderDecorations.value) {
    if (decoration.border === "uniform") {
      const calculated = toBorderStyle(decoration.left);
      if (calculated !== "none") {
        style.borderTop = calculated;
        style.borderBottom = calculated;
        style.borderLeft = calculated;
        style.borderRight = calculated;
      }
    } else {
      const left = toBorderStyle(decoration.left);
      if (left !== "none") style.borderLeft = left;
      const right = toBorderStyle(decoration.right);
      if (right !== "none") style.borderRight = right;
      const top = toBorderStyle(decoration.top);
      if (top !== "none") style.borderTop = top;
      const bottom = toBorderStyle(decoration.bottom);
      if (bottom !== "none") style.borderBottom = bottom;
    }
  }

  return style;
});
function toBorderStyle(side: BorderSettings) {
  if (!side.show) return "none";
  return `${side.width}px ${side.style} ${side.color}`;
}
</script>

<template>
  <div class="calendar-decoration" :style="borderStyle">
    <slot></slot>
    <DecorationShape v-for="(decoration, index) in shapeDecorations" :key="index" :decoration="decoration" />
    <DecorationCorner v-for="(decoration, index) in cornerDecorations" :key="index" :decoration="decoration" />
    <DecorationIcon v-for="(decoration, index) in iconDecorations" :key="index" :decoration="decoration" />
  </div>
</template>

<style scoped>
.calendar-decoration {
  position: relative;
  background-color: v-bind(background);
  color: v-bind(textColor);
}
</style>
