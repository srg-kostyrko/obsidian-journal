<script setup lang="ts">
import { useField } from "vee-validate";

import type { ColorSettings, JournalDecorationShape } from "@/decorations";
import { m } from "@/i18n";
import UiColorSettingsPicker from "@/ui/UiColorSettingsPicker.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const { name } = defineProps<{ name: string }>();
const { value: shape } = useField<JournalDecorationShape["shape"]>(`${name}.shape`);
const { value: size } = useField<number>(`${name}.size`);
const { value: color } = useField<ColorSettings>(`${name}.color`);
const { value: placementX } = useField<JournalDecorationShape["placement_x"]>(`${name}.placement_x`);
const { value: placementY } = useField<JournalDecorationShape["placement_y"]>(`${name}.placement_y`);
</script>

<template>
  <UiSettingRow :name="m.decoration_style_shape_shape_label()">
    <UiDropdown v-model="shape">
      <option value="square">{{ m.decoration_shape_label({ shape: "square" }) }}</option>
      <option value="circle">{{ m.decoration_shape_label({ shape: "circle" }) }}</option>
      <option value="triangle-up">{{ m.decoration_shape_label({ shape: "triangle-up" }) }}</option>
      <option value="triangle-down">{{ m.decoration_shape_label({ shape: "triangle-down" }) }}</option>
      <option value="triangle-left">{{ m.decoration_shape_label({ shape: "triangle-left" }) }}</option>
      <option value="triangle-right">{{ m.decoration_shape_label({ shape: "triangle-right" }) }}</option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_style_shape_size_label()">
    <template #description>{{ m.decoration_style_shape_size_hint() }}</template>
    <UiNumberInput v-model="size" :min="0" :step="0.1" />
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_style_shape_color_label()">
    <UiColorSettingsPicker v-model="color" />
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_style_shape_placement_x_label()">
    <UiDropdown v-model="placementX">
      <option value="left">{{ m.decoration_placement_x_label({ value: "left" }) }}</option>
      <option value="center">{{ m.decoration_placement_x_label({ value: "center" }) }}</option>
      <option value="right">{{ m.decoration_placement_x_label({ value: "right" }) }}</option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_style_shape_placement_y_label()">
    <UiDropdown v-model="placementY">
      <option value="top">{{ m.decoration_placement_y_label({ value: "top" }) }}</option>
      <option value="middle">{{ m.decoration_placement_y_label({ value: "middle" }) }}</option>
      <option value="bottom">{{ m.decoration_placement_y_label({ value: "bottom" }) }}</option>
    </UiDropdown>
  </UiSettingRow>
</template>
