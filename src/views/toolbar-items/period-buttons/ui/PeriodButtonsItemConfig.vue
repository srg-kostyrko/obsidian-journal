<script setup lang="ts">
import { m } from "@/i18n";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import type { PeriodButtonsConfig, PeriodButtonsConfigChange } from "../period-buttons-item";

const props = defineProps<{
  config: PeriodButtonsConfig;
  onChange: PeriodButtonsConfigChange;
}>();

const update = (patch: Partial<PeriodButtonsConfig>): void => props.onChange({ ...props.config, ...patch });
</script>

<template>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_period_buttons_config({ period: "week" }) }}</template>
    <UiToggle
      :model-value="config.week"
      @update:model-value="(value: boolean | undefined) => update({ week: value ?? false })"
    />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_period_buttons_config({ period: "month" }) }}</template>
    <UiToggle
      :model-value="config.month"
      @update:model-value="(value: boolean | undefined) => update({ month: value ?? false })"
    />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_period_buttons_config({ period: "quarter" }) }}</template>
    <UiToggle
      :model-value="config.quarter"
      @update:model-value="(value: boolean | undefined) => update({ quarter: value ?? false })"
    />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_period_buttons_config({ period: "year" }) }}</template>
    <UiToggle
      :model-value="config.year"
      @update:model-value="(value: boolean | undefined) => update({ year: value ?? false })"
    />
  </UiSettingRow>
</template>
