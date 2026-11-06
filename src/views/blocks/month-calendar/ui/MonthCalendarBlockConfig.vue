<script setup lang="ts">
import { m } from "@/i18n";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import CalendarBlockConfigFields from "../../ui/CalendarBlockConfigFields.vue";

import type { MonthCalendarConfig, MonthCalendarConfigChange } from "../month-calendar-block";

const props = defineProps<{
  config: MonthCalendarConfig;
  onChange: MonthCalendarConfigChange;
}>();

const update = (patch: Partial<MonthCalendarConfig>): void => props.onChange({ ...props.config, ...patch });
</script>

<template>
  <CalendarBlockConfigFields unit="month" :config="config" :on-change="update" />
  <UiSettingRow>
    <template #name>{{ m.view_block_config_outside_days_label() }}</template>
    <UiDropdown
      :model-value="config.outsideDays"
      @update:model-value="(v) => update({ outsideDays: v as MonthCalendarConfig['outsideDays'] })"
    >
      <option value="default">{{ m.view_block_config_visibility_default() }}</option>
      <option value="interactive">{{ m.view_block_config_outside_days({ option: "interactive" }) }}</option>
      <option value="inert">{{ m.view_block_config_outside_days({ option: "inert" }) }}</option>
      <option value="hidden">{{ m.view_block_config_outside_days({ option: "hidden" }) }}</option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_block_config_month_rows_label() }}</template>
    <UiDropdown
      :model-value="config.monthRows"
      @update:model-value="(v) => update({ monthRows: v as MonthCalendarConfig['monthRows'] })"
    >
      <option value="default">{{ m.view_block_config_visibility_default() }}</option>
      <option value="fit">{{ m.view_block_config_month_rows({ option: "fit" }) }}</option>
      <option value="six">{{ m.view_block_config_month_rows({ option: "six" }) }}</option>
    </UiDropdown>
  </UiSettingRow>
</template>
