<script setup lang="ts">
import { computed } from "vue";
import type { BorderSettings, ColorSettings } from "@/types/settings.types";
import ObsidianSetting from "@/components/obsidian/ObsidianSetting.vue";
import ObsidianToggle from "@/components/obsidian/ObsidianToggle.vue";
import ObsidianNumberInput from "@/components/obsidian/ObsidianNumberInput.vue";
import ObsidianDropdown from "@/components/obsidian/ObsidianDropdown.vue";
import ColorPicker from "@/components/ColorPicker.vue";

const props = defineProps<{ border: BorderSettings; label: string }>();
const emit = defineEmits<
  <K extends keyof BorderSettings>(
    event: "change",
    change: {
      prop: K;
      value: BorderSettings[K];
    },
  ) => void
>();

const show = computed({
  get() {
    return props.border.show;
  },
  set(value: boolean) {
    emit("change", { prop: "show", value });
  },
});
const width = computed({
  get() {
    return props.border.width;
  },
  set(value: number) {
    emit("change", { prop: "width", value });
  },
});
const color = computed({
  get() {
    return props.border.color;
  },
  set(value: ColorSettings) {
    emit("change", { prop: "color", value });
  },
});
const style = computed({
  get() {
    return props.border.style;
  },
  set(value: string) {
    emit("change", { prop: "style", value });
  },
});
</script>

<template>
  <ObsidianSetting :name="label">
    <ObsidianToggle v-model="show" />
    <template v-if="show">
      <ObsidianNumberInput v-model="width" narrow :min="1" />
      <ObsidianDropdown v-model="style">
        <option value="solid">Solid</option>
        <option value="dotted">Dotted</option>
        <option value="dashed">Dashed</option>
        <option value="groove">groove</option>
        <option value="groove">ridge</option>
      </ObsidianDropdown>
      <ColorPicker v-model="color" />
    </template>
  </ObsidianSetting>
</template>
