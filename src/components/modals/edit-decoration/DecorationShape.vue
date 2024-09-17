<script setup lang="ts">
import ObsidianColorPicker from "@/components/obsidian/ObsidianColorPicker.vue";
import ObsidianDropdown from "@/components/obsidian/ObsidianDropdown.vue";
import ObsidianSetting from "@/components/obsidian/ObsidianSetting.vue";
import type { JournalDecorationShape } from "@/types/settings.types";
import { computed } from "vue";

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
    <ObsidianColorPicker v-model="color" />
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
