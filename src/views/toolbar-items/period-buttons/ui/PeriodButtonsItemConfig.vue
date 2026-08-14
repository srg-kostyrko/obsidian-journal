<script setup lang="ts">
import { m } from "@/i18n";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggleGroup from "@/ui/UiToggleGroup.vue";

import type { PeriodButtonsConfig, PeriodButtonsConfigChange } from "../period-buttons-item";

type Period = "week" | "month" | "quarter" | "year";

const props = defineProps<{
  config: PeriodButtonsConfig;
  onChange: PeriodButtonsConfigChange;
}>();

const allPeriods: readonly Period[] = ["week", "month", "quarter", "year"];
const periodOptions = allPeriods.map((period) => ({
  value: period,
  label: m.view_toolbar_button_config_level_option({ level: period }),
  tooltip: m.view_toolbar_period_buttons_config({ period }),
}));

function setShownPeriods(shown: Period[]): void {
  props.onChange({
    week: shown.includes("week"),
    month: shown.includes("month"),
    quarter: shown.includes("quarter"),
    year: shown.includes("year"),
  });
}
</script>

<template>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_period_buttons_config_label() }}</template>
    <UiToggleGroup
      :model-value="allPeriods.filter((period) => config[period])"
      :options="periodOptions"
      @update:model-value="setShownPeriods"
    />
  </UiSettingRow>
</template>
