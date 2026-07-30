<script setup lang="ts">
import { useField } from "vee-validate";

import type { ColorSettings, JournalDecorationCorner } from "@/decorations";
import { m } from "@/i18n";
import UiColorSettingsPicker from "@/ui/UiColorSettingsPicker.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const { name } = defineProps<{ name: string }>();
const { value: placement } = useField<JournalDecorationCorner["placement"]>(`${name}.placement`);
const { value: color } = useField<ColorSettings>(`${name}.color`);
</script>

<template>
  <UiSettingRow :name="m.decoration_style_corner_placement_label()">
    <UiDropdown v-model="placement">
      <option value="top-left">{{ m.decoration_corner_placement_label({ placement: "top-left" }) }}</option>
      <option value="top-right">{{ m.decoration_corner_placement_label({ placement: "top-right" }) }}</option>
      <option value="bottom-left">{{ m.decoration_corner_placement_label({ placement: "bottom-left" }) }}</option>
      <option value="bottom-right">{{ m.decoration_corner_placement_label({ placement: "bottom-right" }) }}</option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow :name="m.common_label_color()">
    <UiColorSettingsPicker v-model="color" role="fill" />
  </UiSettingRow>
</template>
