<script setup lang="ts">
import { m } from "@/i18n";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import type { CustomIntervalsConfig, CustomIntervalsConfigChange } from "../custom-intervals-block";

const props = defineProps<{
  config: CustomIntervalsConfig;
  onChange: CustomIntervalsConfigChange;
}>();

const update = (patch: Partial<CustomIntervalsConfig>): void => props.onChange({ ...props.config, ...patch });
</script>

<template>
  <UiSettingRow>
    <template #name>{{ m.view_block_config_window_label() }}</template>
    <UiDropdown
      :model-value="config.window"
      @update:model-value="
        (value: string | undefined) => value && update({ window: value as CustomIntervalsConfig['window'] })
      "
    >
      <option value="week">{{ m.view_block_config_window_current({ period: "week" }) }}</option>
      <option value="month">{{ m.view_block_config_window_current({ period: "month" }) }}</option>
      <option value="quarter">{{ m.view_block_config_window_current({ period: "quarter" }) }}</option>
      <option value="year">{{ m.view_block_config_window_current({ period: "year" }) }}</option>
    </UiDropdown>
  </UiSettingRow>
</template>
