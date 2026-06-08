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

function isNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// Day is stored 1-based, month 0-based (matching the date the period falls on); an empty
// field stores the wildcard sentinel (-1 / null) meaning "match any".
const dayModel = computed<number | undefined>({
  get: () => (day.value === -1 ? undefined : day.value),
  set: (next) => {
    day.value = isNumber(next) ? next : -1;
  },
});

const monthModel = computed<number | undefined>({
  get: () => (month.value === -1 ? undefined : month.value + 1),
  set: (next) => {
    month.value = isNumber(next) ? next - 1 : -1;
  },
});

const yearModel = computed<number | undefined>({
  get: () => year.value ?? undefined,
  set: (next) => {
    year.value = isNumber(next) ? next : null;
  },
});
</script>

<template>
  <UiSettingRow :name="m.decoration_condition_date_unit_label({ unit: 'day' })">
    <template #description>{{ m.decoration_condition_date_hint() }}</template>
    <UiNumberInput
      v-model="dayModel"
      :min="1"
      :max="31"
      :placeholder="m.decoration_condition_date_any_unit({ unit: 'day' })"
    />
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_condition_date_unit_label({ unit: 'month' })">
    <UiNumberInput
      v-model="monthModel"
      :min="1"
      :max="12"
      :placeholder="m.decoration_condition_date_any_unit({ unit: 'month' })"
    />
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_condition_date_unit_label({ unit: 'year' })">
    <UiNumberInput v-model="yearModel" :placeholder="m.decoration_condition_date_any_unit({ unit: 'year' })" />
  </UiSettingRow>
</template>
