<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { SettingsService } from "@/settings";
import { icons } from "@/ui/icons";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

import { dayNotesSlice } from "../slice";

const settings = useService(SettingsService).getSlice(dayNotesSlice);
const expanded = ref(false);

const property = computed({
  get: () => settings.state.property,
  set: (property: string) => {
    settings.state = { ...settings.state, property };
  },
});

const format = computed({
  get: () => settings.state.format,
  set: (format: string) => {
    settings.state = { ...settings.state, format };
  },
});
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded">
    <template #trigger>
      <UiIconedRow :icon="icons.block.dayNotes">{{ m.day_notes_settings_title() }}</UiIconedRow>
    </template>
    <UiSettingRow :name="m.day_notes_settings_property_label()">
      <template #description>{{ m.day_notes_settings_property_description() }}</template>
      <UiTextInput v-model="property" />
    </UiSettingRow>
    <UiSettingRow :name="m.day_notes_settings_format_label()">
      <template #description>{{ m.day_notes_settings_format_description() }}</template>
      <UiTextInput v-model="format" />
    </UiSettingRow>
  </UiCollapsibleBlock>
</template>
