<script setup lang="ts">
import { useField } from "vee-validate";
import { computed } from "vue";

import { m } from "@/i18n";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const { name } = defineProps<{ name: string }>();
const { value: offset } = useField<number>(`${name}.offset`);

const hint = computed(() =>
  m.decoration_condition_offset_hint({ days: Math.abs(offset.value), side: offset.value < 0 ? "end" : "start" }),
);
</script>

<template>
  <UiSettingRow :name="m.decoration_condition_offset_label()">
    <template #description>{{ hint }}</template>
    <UiNumberInput v-model="offset" />
  </UiSettingRow>
</template>
