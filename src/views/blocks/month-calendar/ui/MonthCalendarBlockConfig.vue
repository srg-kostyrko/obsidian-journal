<script setup lang="ts">
import { Calendar } from "@/calendar";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import type { MonthCalendarConfig, MonthCalendarConfigChange } from "../month-calendar-block";

const props = defineProps<{
  config: MonthCalendarConfig;
  onChange: MonthCalendarConfigChange;
}>();

const update = (patch: Partial<MonthCalendarConfig>): void => props.onChange({ ...props.config, ...patch });

const orderedWeekdays = useService(Calendar).weekdaysShort();

function toggleWeekday(index: number, hidden: boolean): void {
  const next = new Set(props.config.hiddenWeekdays);
  if (hidden) next.add(index);
  else next.delete(index);
  update({ hiddenWeekdays: [...next].toSorted((a, b) => a - b) });
}
</script>

<template>
  <UiSettingRow>
    <template #name>{{ m.view_block_config_before({ unit: "month" }) }}</template>
    <UiNumberInput :model-value="config.before" :min="0" @update:model-value="(v) => update({ before: v })" />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_block_config_after({ unit: "month" }) }}</template>
    <UiNumberInput :model-value="config.after" :min="0" @update:model-value="(v) => update({ after: v })" />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_block_config_hidden_weekdays_label() }}</template>
    <label v-for="{ index, label } in orderedWeekdays" :key="index">
      <input
        type="checkbox"
        :checked="config.hiddenWeekdays.includes(index)"
        @change="toggleWeekday(index, ($event.target as HTMLInputElement).checked)"
      />
      {{ label }}
    </label>
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_block_config_weeks_label() }}</template>
    <UiDropdown
      :model-value="config.weeks"
      @update:model-value="(v) => update({ weeks: v as MonthCalendarConfig['weeks'] })"
    >
      <option value="none">{{ m.view_block_config_weeks_none() }}</option>
      <option value="left">{{ m.view_block_config_weeks_left() }}</option>
      <option value="right">{{ m.view_block_config_weeks_right() }}</option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_block_config_show_heading_label() }}</template>
    <UiToggle
      :model-value="config.showHeading"
      @update:model-value="(value: boolean | undefined) => update({ showHeading: value ?? false })"
    />
  </UiSettingRow>
</template>
