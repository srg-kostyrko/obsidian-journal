<script setup lang="ts">
import { m } from "@/i18n";
import { icons } from "@/ui/icons";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconSuggest from "@/ui/UiIconSuggest.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

import type { ToolbarAppearanceChange, ToolbarItemAppearance } from "../appearance";

type AppearanceField = keyof ToolbarItemAppearance;

const props = defineProps<{
  value: ToolbarItemAppearance;
  appearance: ToolbarItemAppearance;
  onChange: ToolbarAppearanceChange;
}>();

// An action with no default for a field resolves it to undefined while the stored value is
// "", so both sides are normalized — otherwise reset would never settle into its disabled state.
const isDefault = (field: AppearanceField): boolean => (props.value[field] ?? "") === (props.appearance[field] ?? "");

const set = (field: AppearanceField, next: string | undefined): void => props.onChange({ [field]: next ?? "" });

const reset = (field: AppearanceField): void => set(field, props.appearance[field]);
</script>

<template>
  <UiSettingRow>
    <template #name>{{ m.common_label_icon() }}</template>
    <UiIconSuggest
      :model-value="value.icon ?? ''"
      @update:model-value="(next: string | undefined) => set('icon', next)"
    />
    <UiIconButton
      :icon="icons.action.reset"
      :tooltip="m.view_toolbar_appearance_reset({ field: 'icon' })"
      :disabled="isDefault('icon')"
      @click="reset('icon')"
    />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_appearance_label_label() }}</template>
    <UiTextInput
      :model-value="value.label ?? ''"
      @update:model-value="(next: string | undefined) => set('label', next)"
    />
    <UiIconButton
      :icon="icons.action.reset"
      :tooltip="m.view_toolbar_appearance_reset({ field: 'label' })"
      :disabled="isDefault('label')"
      @click="reset('label')"
    />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_appearance_tooltip_label() }}</template>
    <UiTextInput
      :model-value="value.tooltip ?? ''"
      @update:model-value="(next: string | undefined) => set('tooltip', next)"
    />
    <UiIconButton
      :icon="icons.action.reset"
      :tooltip="m.view_toolbar_appearance_reset({ field: 'tooltip' })"
      :disabled="isDefault('tooltip')"
      @click="reset('tooltip')"
    />
  </UiSettingRow>
</template>
