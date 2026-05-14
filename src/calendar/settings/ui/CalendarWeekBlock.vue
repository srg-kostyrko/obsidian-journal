<script setup lang="ts">
import { computed } from "vue";

import { detectCurrentPreset } from "@/calendar/presets";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModalService } from "@/infrastructure/host/modals";
import { SettingsService } from "@/settings";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { calendarSlice } from "../slice";

import { weekPresetPickerModal } from "./week-preset-picker-modal";

const settings = useService(SettingsService);
const modals = useModalService();
const slice = settings.getSlice(calendarSlice);

const presetSummary = computed(() => {
  const state = slice.state;
  if (state.mode === "locale") return m.calendar_preset_description({ preset: "locale" });
  const detected = detectCurrentPreset({ dow: state.dow, doy: state.doy });
  const presetId = detected === "custom" ? "custom" : detected.id;
  return m.calendar_preset_description({ preset: presetId });
});

const globalRef = computed({
  get: () => (slice.state.mode === "custom" ? slice.state.global : false),
  set: (v: boolean) => {
    if (slice.state.mode !== "custom") return;
    slice.state = { ...slice.state, global: v };
  },
});

function change(): void {
  void modals.open(weekPresetPickerModal, { current: slice.state }).tap((value) => {
    slice.state = value;
  });
}
</script>

<template>
  <UiSettingRow heading :name="m.calendar_week_config_title()">
    <template #description>{{ presetSummary }}</template>
    <UiButton @click="change">{{ m.calendar_week_config_change() }}</UiButton>
  </UiSettingRow>
  <UiSettingRow v-if="slice.state.mode === 'custom'" :name="m.calendar_apply_globally_title()">
    <template #description>
      {{ m.calendar_apply_globally_desc() }}
      <div class="journal-hint">{{ m.calendar_apply_globally_restart_hint() }}</div>
    </template>
    <UiToggle v-model="globalRef" />
  </UiSettingRow>
</template>

<style scoped>
.journal-hint {
  color: var(--text-warning);
}
</style>
