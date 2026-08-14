<script setup lang="ts">
import { useField } from "vee-validate";

import type { ColorSettings } from "@/decorations";
import { m } from "@/i18n";
import UiColorSettingsPicker from "@/ui/UiColorSettingsPicker.vue";
import UiIconSuggest from "@/ui/UiIconSuggest.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const { name } = defineProps<{ name: string }>();
const { value: icon } = useField<string>(`${name}.icon`, undefined, { keepValueOnUnmount: true });
const { value: size } = useField<number>(`${name}.size`, undefined, { keepValueOnUnmount: true });
const { value: color } = useField<ColorSettings>(`${name}.color`, undefined, { keepValueOnUnmount: true });
</script>

<template>
  <UiSettingRow :name="m.common_label_icon()">
    <UiIconSuggest v-model="icon" />
  </UiSettingRow>
  <UiSettingRow :name="m.common_label_color()">
    <UiColorSettingsPicker v-model="color" role="text" />
  </UiSettingRow>
  <UiSettingRow :name="m.common_label_size()">
    <template #description>{{ m.decoration_style_size_hint({ kind: "icon" }) }}</template>
    <UiNumberInput v-model="size" :min="0.1" :step="0.1" />
  </UiSettingRow>
</template>
