<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { SettingsService } from "@/settings";
import { icons } from "@/ui/icons";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { EditCheckboxProviderFlow } from "../flows/edit-checkbox-provider.flow";
import { checkboxSlice } from "../slice";

import { describeCheckboxRule } from "./describe-rule";

const flows = useService(Flows);
const slice = useService(SettingsService).getSlice(checkboxSlice);

const summary = computed(() => describeCheckboxRule(slice.state.rule));

function configure(): void {
  void flows.invoke(EditCheckboxProviderFlow, {});
}
</script>

<template>
  <UiSettingRow :name="m.tasks_settings_provider_checkbox()">
    <template #description>
      {{ m.tasks_settings_provider_checkbox_desc() }}
      <span data-testid="checkbox-summary">{{ summary }}</span>
    </template>
    <UiToggle v-model="slice.state.enabled" data-testid="checkbox-enabled" />
    <UiIconButton
      :icon="icons.action.configure"
      :tooltip="m.tasks_settings_configure()"
      data-testid="checkbox-configure"
      @click="configure"
    />
  </UiSettingRow>
</template>
