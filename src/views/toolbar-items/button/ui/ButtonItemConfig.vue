<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconSuggest from "@/ui/UiIconSuggest.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";
import UiToggle from "@/ui/UiToggle.vue";

import {
  resolveButtonAppearance,
  type ButtonConfig,
  type ButtonConfigChange,
  type ButtonLevel,
} from "../button-config";

const props = defineProps<{
  config: ButtonConfig;
  onChange: ButtonConfigChange;
}>();

const allLevels: readonly ButtonLevel[] = ["day", "week", "month", "quarter", "year"];

// Defaults the action would display when the field is left blank, surfaced as placeholders so the
// per-action display is visible while editing.
const appearance = computed(() => resolveButtonAppearance(props.config.action));

const update = (patch: Partial<ButtonConfig>): void => props.onChange({ ...props.config, ...patch });

const periodAction = computed(() => {
  const action = props.config.action;
  return action.type === "navigate-step" ? null : action;
});

function setMode(mode: "select-only" | "navigate" | "create"): void {
  const action = periodAction.value;
  if (!action) return;
  update({ action: { ...action, mode } });
}

function toggleLevel(level: ButtonLevel, enabled: boolean): void {
  const action = periodAction.value;
  if (!action) return;
  const selected = new Set(action.levels);
  if (enabled) {
    selected.add(level);
  } else {
    if (selected.size === 1) return;
    selected.delete(level);
  }
  update({ action: { ...action, levels: allLevels.filter((l) => selected.has(l)) } });
}
</script>

<template>
  <UiSettingRow>
    <template #name>{{ m.common_label_icon() }}</template>
    <UiIconSuggest
      :model-value="config.icon ?? ''"
      :placeholder="appearance.icon"
      @update:model-value="(value: string | undefined) => update({ icon: value || undefined })"
    />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_button_config_label_label() }}</template>
    <UiTextInput
      :model-value="config.label ?? ''"
      :placeholder="appearance.label"
      @update:model-value="(value: string | undefined) => update({ label: value || undefined })"
    />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_button_config_tooltip_label() }}</template>
    <UiTextInput
      :model-value="config.tooltip ?? ''"
      :placeholder="appearance.tooltip"
      @update:model-value="(value: string | undefined) => update({ tooltip: value || undefined })"
    />
  </UiSettingRow>
  <template v-if="periodAction">
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
    <UiSettingRow v-for="level of allLevels" :key="level">
      <template #name>{{ m.view_toolbar_button_config_level_option({ level }) }}</template>
      <UiToggle
        :model-value="periodAction.levels.includes(level)"
        :tooltip="m.view_toolbar_button_config_level_option({ level })"
        @update:model-value="(enabled: boolean | undefined) => toggleLevel(level, enabled ?? false)"
      />
    </UiSettingRow>
  </template>
</template>
