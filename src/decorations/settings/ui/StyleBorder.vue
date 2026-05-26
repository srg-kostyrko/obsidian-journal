<script setup lang="ts">
import { useField } from "vee-validate";
import { watch } from "vue";

import type { BorderSide, JournalDecorationBorder } from "@/decorations";
import { m } from "@/i18n";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import StyleBorderSide from "./StyleBorderSide.vue";

const { name } = defineProps<{ name: string }>();
const { value: mode } = useField<JournalDecorationBorder["border"]>(`${name}.border`);
const { value: top } = useField<BorderSide>(`${name}.top`);
const { value: bottom } = useField<BorderSide>(`${name}.bottom`);
const { value: left } = useField<BorderSide>(`${name}.left`);
const { value: right } = useField<BorderSide>(`${name}.right`);

watch(
  [top, mode],
  () => {
    if (mode.value !== "uniform") return;
    bottom.value = { ...top.value };
    left.value = { ...top.value };
    right.value = { ...top.value };
  },
  { deep: true },
);
</script>

<template>
  <UiSettingRow :name="m.decoration_style_border_mode_label()">
    <UiDropdown v-model="mode">
      <option value="uniform">{{ m.decoration_border_mode_label({ mode: "uniform" }) }}</option>
      <option value="different">{{ m.decoration_border_mode_label({ mode: "different" }) }}</option>
    </UiDropdown>
  </UiSettingRow>
  <template v-if="mode === 'uniform'">
    <StyleBorderSide :name="`${name}.top`" />
  </template>
  <template v-else>
    <UiSettingRow heading>
      <template #name>{{ m.decoration_border_side_label({ side: "top" }) }}</template>
    </UiSettingRow>
    <StyleBorderSide :name="`${name}.top`" />
    <UiSettingRow heading>
      <template #name>{{ m.decoration_border_side_label({ side: "bottom" }) }}</template>
    </UiSettingRow>
    <StyleBorderSide :name="`${name}.bottom`" />
    <UiSettingRow heading>
      <template #name>{{ m.decoration_border_side_label({ side: "left" }) }}</template>
    </UiSettingRow>
    <StyleBorderSide :name="`${name}.left`" />
    <UiSettingRow heading>
      <template #name>{{ m.decoration_border_side_label({ side: "right" }) }}</template>
    </UiSettingRow>
    <StyleBorderSide :name="`${name}.right`" />
  </template>
</template>
