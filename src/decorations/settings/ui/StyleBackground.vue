<script setup lang="ts">
import { useField } from "vee-validate";

import type { ColorSettings } from "@/decorations";
import { m } from "@/i18n";
import UiColorSettingsPicker from "@/ui/UiColorSettingsPicker.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const { name } = defineProps<{ name: string }>();
const { value: color } = useField<ColorSettings>(`${name}.color`, undefined, { keepValueOnUnmount: true });
</script>

<template>
  <UiSettingRow :name="m.common_label_background_color()">
    <UiColorSettingsPicker v-model="color" role="background" />
  </UiSettingRow>
</template>
