<script setup lang="ts">
import { useField } from "vee-validate";
import { computed } from "vue";

import { Calendar } from "@/calendar";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";

const { name } = defineProps<{ name: string }>();
const { value: day } = useField<number>(`${name}.day`);
const { value: month } = useField<number>(`${name}.month`);
const { value: year } = useField<number | null>(`${name}.year`);

const monthNames = useService(Calendar).months();

function isNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// Day is stored 1-based, month 0-based (matching the date the period falls on); the empty
// option stores the wildcard sentinel (-1 / null) meaning "match any".
const daySelect = computed<string>({
  get: () => (day.value === -1 ? "" : String(day.value)),
  set: (next) => {
    day.value = next === "" ? -1 : Number(next);
  },
});

const monthSelect = computed<string>({
  get: () => (month.value === -1 ? "" : String(month.value + 1)),
  set: (next) => {
    month.value = next === "" ? -1 : Number(next) - 1;
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
  <UiDropdown v-model="daySelect">
    <option value="">{{ m.decoration_condition_date_any_unit({ unit: "day" }) }}</option>
    <option v-for="dayNumber in 31" :key="dayNumber" :value="String(dayNumber)">{{ dayNumber }}</option>
  </UiDropdown>
  <UiDropdown v-model="monthSelect">
    <option value="">{{ m.decoration_condition_date_any_unit({ unit: "month" }) }}</option>
    <option v-for="(monthName, monthIndex) in monthNames" :key="monthIndex" :value="String(monthIndex + 1)">
      {{ monthName }}
    </option>
  </UiDropdown>
  <UiNumberInput v-model="yearModel" :placeholder="m.decoration_condition_date_any_unit({ unit: 'year' })" />
</template>
