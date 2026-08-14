<script setup lang="ts">
import { m } from "@/i18n";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

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
    <template #name>{{ m.view_block_config_show_heading_label() }}</template>
    <UiToggle
      :model-value="config.showHeading"
      @update:model-value="(value: boolean | undefined) => update({ showHeading: value ?? false })"
    />
  </UiSettingRow>
</template>
