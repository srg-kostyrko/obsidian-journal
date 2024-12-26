<script setup lang="ts">
import { computed } from "vue";
import type { ColorSettings } from "@/types/settings.types";
import ObsidianDropdown from "./obsidian/ObsidianDropdown.vue";
import ObsidianColorPicker from "./obsidian/ObsidianColorPicker.vue";
import { themeColors } from "@/components/ui-texts";

const model = defineModel<ColorSettings>({
  default: () => ({
    type: "transparent",
  }),
});

const type = computed({
  get: () => model.value.type,
  set(value: ColorSettings["type"]) {
    switch (value) {
      case "transparent": {
        model.value = { type: "transparent" };
        break;
      }
      case "custom": {
        model.value = { type: "custom", color: "#000000" };
        break;
      }
      case "theme": {
        model.value = { type: "theme", name: "text-normal" };
        break;
      }
    }
  },
});

const name = computed({
  get: () => (model.value.type === "theme" ? model.value.name : ""),
  set(value: string) {
    if (model.value.type !== "theme") return;
    model.value = { type: "theme", name: value };
  },
});

const color = computed({
  get: () => (model.value.type === "custom" ? model.value.color : ""),
  set(value: string) {
    if (model.value.type !== "custom") return;
    model.value = { type: "custom", color: value };
  },
});

const themeStyle = computed(() => {
  if (model.value.type === "theme") {
    return { background: `var(--${model.value.name})` };
  }
  return {};
});
</script>

<template>
  <div class="color-picker">
    <ObsidianDropdown v-model="type">
      <option value="transparent">Transparent</option>
      <option value="theme">Theme</option>
      <option value="custom">Custom</option>
    </ObsidianDropdown>

    <ObsidianDropdown v-if="type === 'theme'" v-model="name" class="theme-dropdown">
      <option v-for="(colorName, key) of themeColors" :key="key" :value="key">
        {{ colorName }}
      </option>
    </ObsidianDropdown>
    <div v-if="type === 'theme'" class="theme-preview" :style="themeStyle"></div>
    <ObsidianColorPicker v-if="type === 'custom'" v-model="color" />
  </div>
</template>

<style scoped>
.color-picker {
  display: flex;
  align-items: center;
  gap: 8px;
}
.theme-preview {
  width: 28px;
  height: 28px;
  border-radius: 50%;
}
.theme-dropdown {
  max-width: 240px;
}
</style>
