<script setup lang="ts">
import { Calendar } from "@/calendar";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";
import UiToggleGroup from "@/ui/UiToggleGroup.vue";

import type { CalendarBlockFields, CalendarBlockFieldsChange } from "./calendar-block-fields";

const props = defineProps<{
  unit: "month" | "week";
  config: CalendarBlockFields;
  onChange: CalendarBlockFieldsChange;
}>();

const orderedWeekdays = useService(Calendar).weekdaysShort();
const weekdayOptions = orderedWeekdays.map((weekday) => ({ value: weekday.index, label: weekday.label }));
const allWeekdayIndices = orderedWeekdays.map((weekday) => weekday.index);

function setShownWeekdays(shown: number[]): void {
  const hiddenWeekdays = allWeekdayIndices.filter((index) => !shown.includes(index)).toSorted((a, b) => a - b);
  props.onChange({ hiddenWeekdays });
}
</script>

<template>
  <UiSettingRow>
    <template #name>{{ m.view_block_config_follow_active_date_label() }}</template>
    <UiToggle
      :model-value="config.followActiveDate ?? true"
      @update:model-value="(value: boolean | undefined) => onChange({ followActiveDate: value ?? false })"
    />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_block_config_before({ unit }) }}</template>
    <UiNumberInput :model-value="config.before" :min="0" @update:model-value="(v) => onChange({ before: v })" />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_block_config_after({ unit }) }}</template>
    <UiNumberInput :model-value="config.after" :min="0" @update:model-value="(v) => onChange({ after: v })" />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_block_config_hidden_weekdays_label() }}</template>
    <UiToggleGroup
      :model-value="allWeekdayIndices.filter((index) => !config.hiddenWeekdays.includes(index))"
      :options="weekdayOptions"
      @update:model-value="setShownWeekdays"
    />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_block_config_weeks_label() }}</template>
    <UiDropdown
      :model-value="config.weeks"
      @update:model-value="(v) => onChange({ weeks: v as CalendarBlockFields['weeks'] })"
    >
      <option value="default">{{ m.view_block_config_weeks_default() }}</option>
      <option value="none">{{ m.view_block_config_weeks_none() }}</option>
      <option value="left">{{ m.view_block_config_weeks_left() }}</option>
      <option value="right">{{ m.view_block_config_weeks_right() }}</option>
    </UiDropdown>
  </UiSettingRow>
</template>
