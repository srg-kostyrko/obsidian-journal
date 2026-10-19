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

import { EditNotePropertyProviderFlow } from "../flows/edit-note-property-provider.flow";
import { notePropertySlice } from "../slice";

import { describeIdentification } from "./describe";

const flows = useService(Flows);
const slice = useService(SettingsService).getSlice(notePropertySlice);

const summary = computed(() => describeIdentification(slice.state.identify));

function configure(): void {
  void flows.invoke(EditNotePropertyProviderFlow, {});
}
</script>

<template>
  <UiSettingRow :name="m.tasks_settings_provider_note_property()">
    <template #description>
      {{ m.tasks_settings_provider_note_property_desc() }}
      <span data-testid="note-property-summary">{{ summary }}</span>
    </template>
    <UiToggle v-model="slice.state.enabled" data-testid="note-property-enabled" />
    <UiIconButton
      :icon="icons.action.configure"
      :tooltip="m.tasks_settings_configure()"
      data-testid="note-property-configure"
      @click="configure"
    />
  </UiSettingRow>
</template>
