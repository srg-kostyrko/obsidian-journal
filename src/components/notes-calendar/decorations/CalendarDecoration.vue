<script setup lang="ts">
import type {
  BorderSettings,
  JournalDecorationIcon,
  JournalDecorationShape,
  JournalDecorationsStyle,
} from "@/types/settings.types";
import { computed } from "vue";
import DecorationShape from "./DecorationShape.vue";
import DecorationCorner from "./DecorationCorner.vue";
import DecorationIcon from "./DecorationIcon.vue";
import { colorToString } from "@/utils/color";

const props = defineProps<{ styles: JournalDecorationsStyle[] }>();

const background = computed(() => {
  const decoration = props.styles.find((d) => d.type === "background");
  if (!decoration) return "inherit";
  return colorToString(decoration.color);
});
const textColor = computed(() => {
  const decoration = props.styles.find((d) => d.type === "color");
  if (!decoration) return "inherit";
  return colorToString(decoration.color);
});

const cornerDecorations = computed(() => props.styles.filter((d) => d.type === "corner"));

const placedDecorations = computed(() => {
  const placed = {
    left_top: [],
    left_middle: [],
    left_bottom: [],
    center_top: [],
    center_middle: [],
    center_bottom: [],
    right_top: [],
    right_middle: [],
    right_bottom: [],
  } as Record<string, (JournalDecorationShape | JournalDecorationIcon)[]>;

  for (const style of props.styles) {
    if (style.type === "shape" || style.type === "icon") {
      placed[`${style.placement_x}_${style.placement_y}`].push(style);
    }
  }

  return placed;
});

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
  return `${side.width}px ${side.style} ${colorToString(side.color)}`;
}
</script>

<template>
  <span class="calendar-decoration" :style="borderStyle">
    <DecorationCorner v-for="(decoration, index) in cornerDecorations" :key="index" :decoration="decoration" />
    <span class="decoration-holder">
      <template v-for="(placed, key) in placedDecorations" :key="key">
        <span v-if="placed.length > 0" :class="`place place-${key}`">
          <template v-for="(decoration, index) in placed" :key="index">
            <DecorationIcon v-if="decoration.type === 'icon'" :decoration="decoration" />
            <DecorationShape v-else-if="decoration.type === 'shape'" :decoration="decoration" />
          </template>
        </span>
      </template>
    </span>
    <slot></slot>
  </span>
</template>

<style scoped>
.calendar-decoration {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: v-bind(background);
  color: v-bind(textColor);
}

.decoration-holder {
  position: absolute;
  inset: 0;
  pointer-events: none;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
}
.place {
  display: flex;
  gap: 2px;
}
.place-left_top {
  grid-area: 1/1;
  justify-content: flex-start;
  align-items: flex-start;
}
.place_left-center {
  grid-area: 2/1;
  justify-content: flex-start;
  align-items: center;
}
.place-left_bottom {
  grid-area: 3/1;
  justify-content: flex-start;
  align-items: flex-end;
}
.place-center_top {
  grid-area: 1/2;
  justify-content: center;
  align-items: flex-start;
}
.place-center_middle {
  grid-area: 2/2;
  justify-content: center;
  align-items: center;
}
.place-center_bottom {
  grid-area: 3/2;
  justify-content: center;
  align-items: flex-end;
}
.place-right_top {
  grid-area: 1/3;
  justify-content: flex-end;
  align-items: flex-start;
}
.place-right_middle {
  grid-area: 2/3;
  justify-content: flex-end;
  align-items: center;
}
.place-right_bottom {
  grid-area: 3/3;
  justify-content: flex-end;
  align-items: flex-end;
}
</style>
