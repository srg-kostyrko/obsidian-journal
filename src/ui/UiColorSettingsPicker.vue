<script setup lang="ts">
import { computed } from "vue";

import type { ColorSettings } from "@/decorations";
import { m } from "@/i18n";

import { THEME_COLOR_NAMES, themeColorLabel } from "./theme-colors";
import UiColorPicker from "./UiColorPicker.vue";
import UiDropdown from "./UiDropdown.vue";

const model = defineModel<ColorSettings>({ required: true });

const themeColorNames = THEME_COLOR_NAMES;

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
    <template v-if="model.type === 'theme'">
      <UiDropdown
        v-model="themeName"
        class="ui-color-settings-picker__theme"
        :aria-label="m.ui_color_theme_variable_label()"
      >
        <option value="">{{ m.ui_color_theme_variable_label() }}</option>
        <option v-for="colorName of themeColorNames" :key="colorName" :value="colorName">
          {{ themeColorLabel(colorName) }}
        </option>
        <option v-if="themeName && !themeColorNames.includes(themeName)" :value="themeName">{{ themeName }}</option>
      </UiDropdown>
      <span
        v-if="themeName"
        class="ui-color-settings-picker__swatch"
        :style="{ backgroundColor: `var(--${themeName})` }"
      />
    </template>
    <UiColorPicker v-if="model.type === 'custom'" v-model="customColor" />
  </span>
</template>

<style scoped>
.ui-color-settings-picker {
  display: inline-flex;
  gap: var(--size-2-2);
  align-items: center;
}
/* The longest theme-variable label ("Background modifier active hover") would otherwise
   set the select's intrinsic width and stretch the row. */
.ui-color-settings-picker__theme {
  max-inline-size: 12em;
  text-overflow: ellipsis;
}
.ui-color-settings-picker__swatch {
  inline-size: 28px;
  block-size: 28px;
  border-radius: 50%;
  border: 1px solid var(--background-modifier-border);
  flex-shrink: 0;
}
</style>
