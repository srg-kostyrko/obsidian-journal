<script setup lang="ts">
import { useField } from "vee-validate";
import { computed } from "vue";

import { Calendar } from "@/calendar";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const { name } = defineProps<{ name: string }>();
const { value: day } = useField<number>(`${name}.day`);
const { value: month } = useField<number>(`${name}.month`);
const { value: year } = useField<number | null>(`${name}.year`);

const monthNames = useService(Calendar).months();

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

const monthSelect = computed<string>({
  get: () => (monthModel.value === undefined ? "" : String(monthModel.value)),
  set: (next) => {
    monthModel.value = next === "" ? undefined : Number(next);
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
    <UiDropdown v-model="monthSelect">
      <option value="">{{ m.decoration_condition_date_any_unit({ unit: "month" }) }}</option>
      <option v-for="(monthName, monthIndex) in monthNames" :key="monthIndex" :value="String(monthIndex + 1)">
        {{ monthName }}
      </option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_condition_date_unit_label({ unit: 'year' })">
    <UiNumberInput v-model="yearModel" :placeholder="m.decoration_condition_date_any_unit({ unit: 'year' })" />
  </UiSettingRow>
</template>
