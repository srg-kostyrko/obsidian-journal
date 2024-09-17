<script setup lang="ts">
import { computed } from "vue";
import type { JournalDecorationBackground } from "@/types/settings.types";
import ObsidianSetting from "@/components/obsidian/ObsidianSetting.vue";
import ObsidianColorPicker from "@/components/obsidian/ObsidianColorPicker.vue";

const props = defineProps<{ decoration: JournalDecorationBackground }>();
const emit = defineEmits<
  <K extends keyof JournalDecorationBackground>(
    event: "change",
    change: {
      prop: K;
      value: JournalDecorationBackground[K];
    },
  ) => void
>();

const color = computed({
  get() {
    return props.decoration.color;
  },
  set(value: string) {
    emit("change", { prop: "color", value });
  },
});
</script>

<template>
  <ObsidianSetting name="Background color">
    <ObsidianColorPicker v-model="color" />
  </ObsidianSetting>
</template>
