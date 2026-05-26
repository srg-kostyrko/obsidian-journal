<script setup lang="ts">
import { match } from "ts-pattern";
import { computed, type Component } from "vue";

import type { JournalDecorationStyle } from "@/decorations";

import StyleBackground from "./StyleBackground.vue";
import StyleBorder from "./StyleBorder.vue";
import StyleColor from "./StyleColor.vue";
import StyleCorner from "./StyleCorner.vue";
import StyleIcon from "./StyleIcon.vue";
import StyleShape from "./StyleShape.vue";

const props = defineProps<{ name: string; style: JournalDecorationStyle }>();

const leaf = computed<Component>(() =>
  match(props.style.type)
    .with("background", () => StyleBackground)
    .with("color", () => StyleColor)
    .with("corner", () => StyleCorner)
    .with("shape", () => StyleShape)
    .with("icon", () => StyleIcon)
    .with("border", () => StyleBorder)
    .exhaustive(),
);
</script>

<template>
  <component :is="leaf" :name="name" />
</template>
