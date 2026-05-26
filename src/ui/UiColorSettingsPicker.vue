<script setup lang="ts">
import { computed } from "vue";

import type { ColorSettings } from "@/decorations";
import { m } from "@/i18n";

import UiColorPicker from "./UiColorPicker.vue";
import UiDropdown from "./UiDropdown.vue";
import UiTextInput from "./UiTextInput.vue";

const model = defineModel<ColorSettings>({ required: true });

const kind = computed<ColorSettings["type"]>({
  get: () => model.value.type,
  set: (next) => {
    if (next === "transparent") model.value = { type: "transparent" };
    else if (next === "theme") model.value = { type: "theme", name: "" };
    else model.value = { type: "custom", color: "#000000" };
  },
});

const themeName = computed<string>({
  get: () => (model.value.type === "theme" ? model.value.name : ""),
  set: (next) => {
    if (model.value.type === "theme") model.value = { type: "theme", name: next };
  },
});

const customColor = computed<string>({
  get: () => (model.value.type === "custom" ? model.value.color : "#000000"),
  set: (next) => {
    if (model.value.type === "custom") model.value = { type: "custom", color: next };
  },
});
</script>

<template>
  <span class="ui-color-settings-picker">
    <UiDropdown v-model="kind">
      <option value="transparent">{{ m.ui_color_kind_label({ kind: "transparent" }) }}</option>
      <option value="theme">{{ m.ui_color_kind_label({ kind: "theme" }) }}</option>
      <option value="custom">{{ m.ui_color_kind_label({ kind: "custom" }) }}</option>
    </UiDropdown>
    <UiTextInput v-if="model.type === 'theme'" v-model="themeName" :placeholder="m.ui_color_theme_variable_label()" />
    <UiColorPicker v-if="model.type === 'custom'" v-model="customColor" />
  </span>
</template>

<style scoped>
.ui-color-settings-picker {
  display: inline-flex;
  gap: var(--size-2-2);
  align-items: center;
}
</style>
