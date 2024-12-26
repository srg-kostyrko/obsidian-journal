<script setup lang="ts">
import { computed } from "vue";
import type { JournalDecorationColor, ColorSettings } from "@/types/settings.types";
import ObsidianSetting from "@/components/obsidian/ObsidianSetting.vue";
import ColorPicker from "@/components/ColorPicker.vue";

const props = defineProps<{ decoration: JournalDecorationColor }>();
const emit = defineEmits<
  <K extends keyof JournalDecorationColor>(
    event: "change",
    change: {
      prop: K;
      value: JournalDecorationColor[K];
    },
  ) => void
>();

const color = computed({
  get() {
    return props.decoration.color;
  },
  set(value: ColorSettings) {
    emit("change", { prop: "color", value });
  },
});
</script>

<template>
  <ObsidianSetting name="Text color">
    <ColorPicker v-model="color" />
  </ObsidianSetting>
</template>
