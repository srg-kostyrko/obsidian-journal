<script setup lang="ts">
import { m } from "@/i18n";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import CalendarBlockConfigFields from "../../ui/CalendarBlockConfigFields.vue";

import type { WeekCalendarConfig, WeekCalendarConfigChange } from "../week-calendar-block";

const props = defineProps<{
  config: WeekCalendarConfig;
  onChange: WeekCalendarConfigChange;
}>();

const update = (patch: Partial<WeekCalendarConfig>): void => props.onChange({ ...props.config, ...patch });
</script>

<template>
  <CalendarBlockConfigFields unit="week" :config="config" :on-change="update" />
  <UiSettingRow>
    <template #name>{{ m.view_block_config_show_heading_label() }}</template>
    <UiToggle
      :model-value="config.showHeading"
      @update:model-value="(value: boolean | undefined) => update({ showHeading: value ?? false })"
    />
  </UiSettingRow>
</template>
