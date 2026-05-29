<script setup lang="ts">
import { m } from "@/i18n";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import type { MonthCalendarConfig, MonthCalendarConfigChange } from "../month-calendar-block";

const props = defineProps<{
  config: MonthCalendarConfig;
  onChange: MonthCalendarConfigChange;
}>();

const update = (patch: Partial<MonthCalendarConfig>): void => props.onChange({ ...props.config, ...patch });
</script>

<template>
  <UiSettingRow>
    <template #name>{{ m.view_block_config_before_label() }}</template>
    <UiNumberInput :model-value="config.before" :min="0" @update:model-value="(v) => update({ before: v })" />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_block_config_after_label() }}</template>
    <UiNumberInput :model-value="config.after" :min="0" @update:model-value="(v) => update({ after: v })" />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_block_config_hide_weekends_label() }}</template>
    <UiToggle :model-value="config.hideWeekends" @update:model-value="(v) => update({ hideWeekends: v })" />
  </UiSettingRow>
</template>
