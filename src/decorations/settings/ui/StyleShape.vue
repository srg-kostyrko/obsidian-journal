<script setup lang="ts">
import { useField } from "vee-validate";

import type { ColorSettings, JournalDecorationShape } from "@/decorations";
import { m } from "@/i18n";
import UiColorSettingsPicker from "@/ui/UiColorSettingsPicker.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const { name } = defineProps<{ name: string }>();
const { value: shape } = useField<JournalDecorationShape["shape"]>(`${name}.shape`, undefined, {
  keepValueOnUnmount: true,
});
const { value: size } = useField<number>(`${name}.size`, undefined, { keepValueOnUnmount: true });
const { value: color } = useField<ColorSettings>(`${name}.color`, undefined, { keepValueOnUnmount: true });
</script>

<template>
  <UiSettingRow :name="m.decoration_style_shape_shape_label()">
    <UiDropdown v-model="shape">
      <option value="circle">{{ m.decoration_shape_label({ shape: "circle" }) }}</option>
      <option value="square">{{ m.decoration_shape_label({ shape: "square" }) }}</option>
      <option value="triangle-up">{{ m.decoration_shape_label({ shape: "triangle-up" }) }}</option>
      <option value="triangle-down">{{ m.decoration_shape_label({ shape: "triangle-down" }) }}</option>
      <option value="triangle-left">{{ m.decoration_shape_label({ shape: "triangle-left" }) }}</option>
      <option value="triangle-right">{{ m.decoration_shape_label({ shape: "triangle-right" }) }}</option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow :name="m.common_label_color()">
    <UiColorSettingsPicker v-model="color" role="fill" />
  </UiSettingRow>
  <UiSettingRow :name="m.common_label_size()">
    <template #description>{{ m.decoration_style_size_hint({ kind: "shape" }) }}</template>
    <UiNumberInput v-model="size" :min="0.1" :step="0.1" />
  </UiSettingRow>
</template>
