<script setup lang="ts">
import { useField } from "vee-validate";

import { m } from "@/i18n";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const { name } = defineProps<{ name: string }>();
const { value: offset } = useField<number>(`${name}.offset`);
</script>

<template>
  <UiSettingRow :name="m.decoration_condition_offset_label()">
    <UiNumberInput v-model="offset" />
  </UiSettingRow>
</template>
