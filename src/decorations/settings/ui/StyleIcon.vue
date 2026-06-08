<script setup lang="ts">
import { useField } from "vee-validate";

import type { ColorSettings, JournalDecorationIcon } from "@/decorations";
import { m } from "@/i18n";
import UiColorSettingsPicker from "@/ui/UiColorSettingsPicker.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconSuggest from "@/ui/UiIconSuggest.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const { name } = defineProps<{ name: string }>();
const { value: icon } = useField<string>(`${name}.icon`);
const { value: size } = useField<number>(`${name}.size`);
const { value: color } = useField<ColorSettings>(`${name}.color`);
const { value: placementX } = useField<JournalDecorationIcon["placement_x"]>(`${name}.placement_x`);
const { value: placementY } = useField<JournalDecorationIcon["placement_y"]>(`${name}.placement_y`);
</script>

<template>
  <UiSettingRow :name="m.common_label_icon()">
    <UiIconSuggest v-model="icon" />
  </UiSettingRow>
  <UiSettingRow :name="m.common_label_size()">
    <template #description>{{ m.decoration_style_size_hint({ kind: "icon" }) }}</template>
    <UiNumberInput v-model="size" :min="0" :step="0.1" />
  </UiSettingRow>
  <UiSettingRow :name="m.common_label_color()">
    <UiColorSettingsPicker v-model="color" />
  </UiSettingRow>
  <UiSettingRow :name="m.common_label_horizontal_placement()">
    <UiDropdown v-model="placementX">
      <option value="left">{{ m.decoration_placement_x_label({ value: "left" }) }}</option>
      <option value="center">{{ m.decoration_placement_x_label({ value: "center" }) }}</option>
      <option value="right">{{ m.decoration_placement_x_label({ value: "right" }) }}</option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow :name="m.common_label_vertical_placement()">
    <UiDropdown v-model="placementY">
      <option value="top">{{ m.decoration_placement_y_label({ value: "top" }) }}</option>
      <option value="middle">{{ m.decoration_placement_y_label({ value: "middle" }) }}</option>
      <option value="bottom">{{ m.decoration_placement_y_label({ value: "bottom" }) }}</option>
    </UiDropdown>
  </UiSettingRow>
</template>
