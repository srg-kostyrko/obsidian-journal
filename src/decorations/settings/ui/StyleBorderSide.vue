<script setup lang="ts">
import { useField } from "vee-validate";

import type { ColorSettings } from "@/decorations";
import { m } from "@/i18n";
import UiColorSettingsPicker from "@/ui/UiColorSettingsPicker.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

const { name } = defineProps<{ name: string }>();
const { value: show } = useField<boolean>(`${name}.show`);
const { value: width } = useField<number>(`${name}.width`);
const { value: color } = useField<ColorSettings>(`${name}.color`);
const { value: borderStyle } = useField<string>(`${name}.style`);
</script>

<template>
  <UiSettingRow :name="m.decoration_style_border_show_label()">
    <UiToggle v-model="show" />
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_style_border_width_label()">
    <UiNumberInput v-model="width" :min="0" :step="1" />
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_style_border_color_label()">
    <UiColorSettingsPicker v-model="color" />
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_style_border_style_label()">
    <UiDropdown v-model="borderStyle">
      <option value="solid">{{ m.decoration_border_style_label({ style: "solid" }) }}</option>
      <option value="dashed">{{ m.decoration_border_style_label({ style: "dashed" }) }}</option>
      <option value="dotted">{{ m.decoration_border_style_label({ style: "dotted" }) }}</option>
      <option value="double">{{ m.decoration_border_style_label({ style: "double" }) }}</option>
    </UiDropdown>
  </UiSettingRow>
</template>
