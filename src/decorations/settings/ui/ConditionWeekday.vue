<script setup lang="ts">
import { useField } from "vee-validate";

import { Calendar } from "@/calendar";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const { name } = defineProps<{ name: string }>();
const { value: weekdays } = useField<number[]>(`${name}.weekdays`);

const orderedWeekdays = useService(Calendar).weekdaysShort();

function toggle(index: number, checked: boolean): void {
  const next = new Set(weekdays.value);
  if (checked) next.add(index);
  else next.delete(index);
  weekdays.value = [...next].toSorted((a, b) => a - b);
}

function isChecked(index: number): boolean {
  return weekdays.value.includes(index);
}
</script>

<template>
  <UiSettingRow :name="m.decoration_condition_weekday_label()">
    <label v-for="{ index, label } in orderedWeekdays" :key="index">
      <input
        type="checkbox"
        :checked="isChecked(index)"
        @change="toggle(index, ($event.target as HTMLInputElement).checked)"
      />
      {{ label }}
    </label>
  </UiSettingRow>
</template>
