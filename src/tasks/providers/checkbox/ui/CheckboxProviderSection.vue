<script setup lang="ts">
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { SettingsService } from "@/settings";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { checkboxSlice } from "../slice";

import RuleEditor from "./RuleEditor.vue";
import StatusMapEditor from "./StatusMapEditor.vue";

const slice = useService(SettingsService).getSlice(checkboxSlice);
</script>

<template>
  <UiSettingRow heading :name="m.tasks_settings_provider_checkbox()" />
  <UiSettingRow :name="m.tasks_settings_enabled()">
    <UiToggle v-model="slice.state.enabled" data-testid="checkbox-enabled" />
  </UiSettingRow>
  <StatusMapEditor />
  <RuleEditor v-model="slice.state.rule" />
</template>
