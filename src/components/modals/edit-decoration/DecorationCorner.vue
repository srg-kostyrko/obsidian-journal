<script setup lang="ts">
import ObsidianColorPicker from "@/components/obsidian/ObsidianColorPicker.vue";
import ObsidianDropdown from "@/components/obsidian/ObsidianDropdown.vue";
import ObsidianSetting from "@/components/obsidian/ObsidianSetting.vue";
import type { JournalDecorationCorner } from "@/types/settings.types";
import { computed } from "vue";

const props = defineProps<{ decoration: JournalDecorationCorner }>();
const emit = defineEmits<
  <K extends keyof JournalDecorationCorner>(
    event: "change",
    change: {
      prop: K;
      value: JournalDecorationCorner[K];
    },
  ) => void
>();
const placement = computed({
  get() {
    return props.decoration.placement;
  },
  set(value) {
    emit("change", { prop: "placement", value });
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
</script>

<template>
  <ObsidianSetting name="Placement">
    <ObsidianDropdown v-model="placement">
      <option value="top-left">Top Left</option>
      <option value="top-right">Top Right</option>
      <option value="bottom-left">Bottom Left</option>
      <option value="bottom-right">Bottom Right</option>
    </ObsidianDropdown>
  </ObsidianSetting>
  <ObsidianSetting name="Color">
    <ObsidianColorPicker v-model="color" />
  </ObsidianSetting>
</template>
