<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { JournalsViewModel } from "@/journals";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggleGroup from "@/ui/UiToggleGroup.vue";

import ToolbarAppearanceRows from "../../ui/ToolbarAppearanceRows.vue";
import {
  resolveButtonAppearance,
  type ButtonConfig,
  type ButtonConfigChange,
  type ButtonLevel,
  type ButtonStepUnit,
} from "../button-config";

const props = defineProps<{
  config: ButtonConfig;
  onChange: ButtonConfigChange;
}>();

const allLevels: readonly ButtonLevel[] = ["day", "week", "month", "quarter", "year"];

const journalsVM = useService(JournalsViewModel);
const journalOptions = journalsVM.journalOptions;

// What the current action would look like — the source the per-field reset restores from.
const appearance = computed(() => resolveButtonAppearance(props.config.action));

const update = (patch: Partial<ButtonConfig>): void => props.onChange({ ...props.config, ...patch });

const periodAction = computed(() => {
  const action = props.config.action;
  return action.type === "navigate-step" ? null : action;
});

const stepAction = computed(() => {
  const action = props.config.action;
  return action.type === "navigate-step" ? action : null;
});

const stepUnits: readonly ButtonStepUnit[] = ["week", "month", "quarter", "year"];

function setDirection(direction: "prev" | "next"): void {
  const action = stepAction.value;
  if (!action) return;
  update({ action: { ...action, direction } });
}

function setUnit(unit: ButtonStepUnit): void {
  const action = stepAction.value;
  if (!action) return;
  update({ action: { ...action, unit } });
}

function setMode(mode: "select-only" | "navigate" | "create"): void {
  const action = periodAction.value;
  if (!action) return;
  update({ action: { ...action, mode } });
}

function setJournal(journal: string | undefined): void {
  const action = periodAction.value;
  if (!action) return;
  update({ action: { ...action, journal } });
}

const levelOptions = allLevels.map((level) => ({
  value: level,
  label: m.view_toolbar_button_config_level_option({ level }),
}));

function setLevels(levels: ButtonLevel[]): void {
  const action = periodAction.value;
  if (!action || levels.length === 0) return;
  update({ action: { ...action, levels: allLevels.filter((level) => levels.includes(level)) } });
}
</script>

<template>
  <ToolbarAppearanceRows :value="config" :appearance="appearance" :on-change="update" />
  <template v-if="periodAction">
    <UiSettingRow>
      <template #name>{{ m.common_label_journal() }}</template>
      <UiDropdown
        :model-value="periodAction.journal ?? ''"
        :aria-label="m.common_label_journal()"
        @update:model-value="(value: string | undefined) => setJournal(value || undefined)"
      >
        <option value="">{{ m.view_toolbar_button_config_journal_default() }}</option>
        <option v-for="option of journalOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </UiDropdown>
    </UiSettingRow>
    <UiSettingRow>
      <template #name>{{ m.view_toolbar_button_config_mode_label() }}</template>
      <UiDropdown
        :model-value="periodAction.mode"
        @update:model-value="
          (value: string | undefined) => value && setMode(value as 'select-only' | 'navigate' | 'create')
        "
      >
        <option value="select-only">{{ m.view_toolbar_button_config_mode_option({ mode: "select-only" }) }}</option>
        <option value="navigate">{{ m.view_toolbar_button_config_mode_option({ mode: "navigate" }) }}</option>
        <option value="create">{{ m.view_toolbar_button_config_mode_option({ mode: "create" }) }}</option>
      </UiDropdown>
    </UiSettingRow>
    <UiSettingRow v-if="!periodAction.journal">
      <template #name>{{ m.view_toolbar_button_config_levels_label() }}</template>
      <UiToggleGroup :model-value="periodAction.levels" :options="levelOptions" @update:model-value="setLevels" />
    </UiSettingRow>
  </template>
  <template v-if="stepAction">
    <UiSettingRow>
      <template #name>{{ m.view_toolbar_button_config_direction_label() }}</template>
      <UiDropdown
        :model-value="stepAction.direction"
        @update:model-value="(value: string | undefined) => value && setDirection(value as 'prev' | 'next')"
      >
        <option value="prev">{{ m.view_toolbar_button_config_direction_option({ direction: "prev" }) }}</option>
        <option value="next">{{ m.view_toolbar_button_config_direction_option({ direction: "next" }) }}</option>
      </UiDropdown>
    </UiSettingRow>
    <UiSettingRow>
      <template #name>{{ m.view_toolbar_button_config_granularity_label() }}</template>
      <UiDropdown
        :model-value="stepAction.unit"
        @update:model-value="
          (value: string | undefined) => value && setUnit(value as 'week' | 'month' | 'quarter' | 'year')
        "
      >
        <option v-for="unit of stepUnits" :key="unit" :value="unit">
          {{ m.view_toolbar_button_config_level_option({ level: unit }) }}
        </option>
      </UiDropdown>
    </UiSettingRow>
  </template>
</template>
