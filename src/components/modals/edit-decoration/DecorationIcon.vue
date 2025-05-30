<script setup lang="ts">
import IconSelector from "@/components/IconSelector.vue";
import ObsidianDropdown from "@/components/obsidian/ObsidianDropdown.vue";
import ObsidianSetting from "@/components/obsidian/ObsidianSetting.vue";
import ObsidianNumberInput from "@/components/obsidian/ObsidianNumberInput.vue";
import type { JournalDecorationIcon } from "@/types/settings.types";
import { computed } from "vue";
import ColorPicker from "@/components/ColorPicker.vue";

const props = defineProps<{ decoration: JournalDecorationIcon }>();
const emit = defineEmits<
  <K extends keyof JournalDecorationIcon>(
    event: "change",
    change: {
      prop: K;
      value: JournalDecorationIcon[K];
    },
  ) => void
>();

const icon = computed({
  get() {
    return props.decoration.icon;
  },
  set(value) {
    emit("change", { prop: "icon", value });
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
    return props.decoration.size ?? 0.5;
  },
  set(value) {
    emit("change", { prop: "size", value });
  },
});
</script>

<template>
  <ObsidianSetting name="Icon">
    <IconSelector v-model="icon" />
  </ObsidianSetting>
  <ObsidianSetting name="Color">
    <ColorPicker v-model="color" />
  </ObsidianSetting>
  <ObsidianSetting name="Size">
    <template #description>
      Icon size is relative to font size where 1 means that an icon is same size as a letter
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
