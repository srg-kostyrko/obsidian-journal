<script setup lang="ts">
import { useField } from "vee-validate";
import { computed } from "vue";

import { m } from "@/i18n";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const { name } = defineProps<{ name: string }>();
const { value: day } = useField<number>(`${name}.day`);
const { value: month } = useField<number>(`${name}.month`);
const { value: year } = useField<number | null>(`${name}.year`);

const yearModel = computed<number | undefined>({
  get: () => year.value ?? undefined,
  set: (next) => {
    year.value = next === undefined || Number.isNaN(next) ? null : next;
  },
});
</script>

<template>
  <UiSettingRow :name="m.decoration_condition_date_day_label()">
    <UiNumberInput v-model="day" :min="1" :max="31" />
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_condition_date_month_label()">
    <UiNumberInput v-model="month" :min="1" :max="12" />
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_condition_date_year_label()">
    <UiNumberInput v-model="yearModel" />
  </UiSettingRow>
</template>
