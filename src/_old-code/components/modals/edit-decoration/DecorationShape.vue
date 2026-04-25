<script setup lang="ts">
import ObsidianDropdown from "@/components/obsidian/ObsidianDropdown.vue";
import ObsidianSetting from "@/components/obsidian/ObsidianSetting.vue";
import type { JournalDecorationShape } from "@/types/settings.types";
import { computed } from "vue";
import ColorPicker from "@/components/ColorPicker.vue";

const props = defineProps<{ decoration: JournalDecorationShape }>();
const emit = defineEmits<
  <K extends keyof JournalDecorationShape>(
    event: "change",
    change: {
      prop: K;
      value: JournalDecorationShape[K];
    },
  ) => void
>();

const shape = computed({
  get() {
    return props.decoration.shape;
  },
  set(value) {
    emit("change", { prop: "shape", value });
  },
});
const color = computed({
  get() {
    return props.decoration.color;
  },
  set(value) {
    emit("change", { prop: "color", value });
  },
});

const placement_x = computed({
  get() {
    return props.decoration.placement_x;
  },
  set(value) {
    emit("change", { prop: "placement_x", value });
  },
});

const placement_y = computed({
  get() {
    return props.decoration.placement_y;
  },
  set(value) {
    emit("change", { prop: "placement_y", value });
  },
});
const size = computed({
  get() {
    return props.decoration.size ?? 0.4;
  },
  set(value) {
    emit("change", { prop: "size", value });
  },
});
</script>

<template>
  <ObsidianSetting name="Shape">
    <ObsidianDropdown v-model="shape">
      <option value="circle">Circle</option>
      <option value="square">Square</option>
      <option value="triangle-up">Triangle Up</option>
      <option value="triangle-down">Triangle Down</option>
      <option value="triangle-left">Triangle Left</option>
      <option value="triangle-right">Triangle Right</option>
    </ObsidianDropdown>
  </ObsidianSetting>
  <ObsidianSetting name="Color">
    <ColorPicker v-model="color" />
  </ObsidianSetting>
  <ObsidianSetting name="Size">
    <template #description>
      Shape size is relative to font size where 1 means that a figure is same size as a letter
    </template>
    <ObsidianNumberInput v-model="size" :min="0.1" :step="0.1" />
  </ObsidianSetting>
  <ObsidianSetting name="Placement">
    <ObsidianDropdown v-model="placement_x">
      <option value="left">Left</option>
      <option value="center">Center</option>
      <option value="right">Right</option>
    </ObsidianDropdown>
    <ObsidianDropdown v-model="placement_y">
      <option value="top">Top</option>
      <option value="middle">Middle</option>
      <option value="bottom">Bottom</option>
    </ObsidianDropdown>
  </ObsidianSetting>
</template>
