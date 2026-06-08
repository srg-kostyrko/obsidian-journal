<script setup lang="ts">
import { m } from "@/i18n";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

import type { ButtonConfig, ButtonConfigChange } from "../button-config";

const props = defineProps<{
  config: ButtonConfig;
  onChange: ButtonConfigChange;
}>();

const update = (patch: Partial<ButtonConfig>): void => props.onChange({ ...props.config, ...patch });
</script>

<template>
  <UiSettingRow>
    <template #name>{{ m.common_label_icon() }}</template>
    <UiTextInput
      :model-value="config.icon ?? ''"
      @update:model-value="(value: string | undefined) => update({ icon: value || undefined })"
    />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_button_config_label_label() }}</template>
    <UiTextInput
      :model-value="config.label ?? ''"
      @update:model-value="(value: string | undefined) => update({ label: value || undefined })"
    />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_button_config_tooltip_label() }}</template>
    <UiTextInput
      :model-value="config.tooltip ?? ''"
      @update:model-value="(value: string | undefined) => update({ tooltip: value || undefined })"
    />
  </UiSettingRow>
</template>
