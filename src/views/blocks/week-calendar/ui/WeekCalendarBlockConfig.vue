<script setup lang="ts">
import { m } from "@/i18n";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import type { WeekCalendarConfig, WeekCalendarConfigChange } from "../week-calendar-block";

const props = defineProps<{
  config: WeekCalendarConfig;
  onChange: WeekCalendarConfigChange;
}>();

const update = (patch: Partial<WeekCalendarConfig>): void => props.onChange({ ...props.config, ...patch });
</script>

<template>
  <UiSettingRow>
    <template #name>{{ m.view_block_config_before_weeks_label() }}</template>
    <UiNumberInput :model-value="config.before" :min="0" @update:model-value="(v) => update({ before: v })" />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_block_config_after_weeks_label() }}</template>
    <UiNumberInput :model-value="config.after" :min="0" @update:model-value="(v) => update({ after: v })" />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_block_config_hide_weekends_label() }}</template>
    <UiToggle :model-value="config.hideWeekends" @update:model-value="(v) => update({ hideWeekends: v })" />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_block_config_weeks_label() }}</template>
    <UiDropdown
      :model-value="config.weeks"
      @update:model-value="(v) => update({ weeks: v as WeekCalendarConfig['weeks'] })"
    >
      <option value="none">{{ m.view_block_config_weeks_none() }}</option>
      <option value="left">{{ m.view_block_config_weeks_left() }}</option>
      <option value="right">{{ m.view_block_config_weeks_right() }}</option>
    </UiDropdown>
  </UiSettingRow>
</template>
