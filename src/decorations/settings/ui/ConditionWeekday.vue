<script setup lang="ts">
import { useField } from "vee-validate";

import { Calendar } from "@/calendar";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import UiToggleGroup from "@/ui/UiToggleGroup.vue";

const { name } = defineProps<{ name: string }>();
const { value: weekdays } = useField<number[]>(`${name}.weekdays`);

const weekdayOptions = useService(Calendar)
  .weekdaysShort()
  .map((weekday) => ({ value: weekday.index, label: weekday.label }));

function setWeekdays(selected: number[]): void {
  weekdays.value = selected.toSorted((a, b) => a - b);
}
</script>

<template>
  <UiToggleGroup
    :model-value="weekdays"
    :options="weekdayOptions"
    :aria-label="m.decoration_condition_weekday_label()"
    @update:model-value="setWeekdays"
  />
</template>
