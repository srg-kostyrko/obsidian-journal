<script setup lang="ts">
import { computed, ref } from "vue";

import { Calendar } from "@/calendar";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { SettingsService } from "@/settings";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggleGroup from "@/ui/UiToggleGroup.vue";

import { noteCreationSlice } from "../../notes/creation-slice";
import { JournalsRepository } from "../../repository";
import { startupSlice } from "../slice";

import type { CreationDevices } from "../../notes/creation-slice";
import type { StartupOverride } from "../slice";

const settings = useService(SettingsService);
const journals = useService(JournalsRepository);
const calendar = useService(Calendar);
const slice = settings.getSlice(startupSlice);
const noteCreation = settings.getSlice(noteCreationSlice);
const expanded = ref(false);

const options = computed(() => [...journals.find().options()]);
const overrides = computed(() => slice.state.overrides);

const journalName = computed({
  get: () => slice.state.journalName,
  set: (name: string) => {
    slice.state = { ...slice.state, journalName: name };
  },
});

const devices = computed({
  get: () => noteCreation.state.devices,
  set: (value: CreationDevices) => {
    noteCreation.state = { ...noteCreation.state, devices: value };
  },
});

function writeOverrides(next: StartupOverride[]): void {
  slice.state = { ...slice.state, overrides: next };
}

function addOverride(): void {
  writeOverrides([...overrides.value, { weekdays: [], journalName: "" }]);
}

function removeOverride(index: number): void {
  writeOverrides(overrides.value.filter((_, current) => current !== index));
}

function patchOverride(index: number, patch: Partial<StartupOverride>): void {
  writeOverrides(overrides.value.map((entry, current) => (current === index ? { ...entry, ...patch } : entry)));
}

// A weekday resolves to exactly one journal, and the service takes the first override claiming it,
// so a day another entry already holds is not offered here — a second claim could never fire.
function weekdayOptionsFor(index: number): { value: number; label: string; disabled: boolean }[] {
  const claimed = new Set(overrides.value.flatMap((entry, current) => (current === index ? [] : entry.weekdays)));
  return calendar.weekdaysShort().map((weekday) => ({
    value: weekday.index,
    label: weekday.label,
    disabled: claimed.has(weekday.index),
  }));
}
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded">
    <template #trigger>
      <UiIconedRow :icon="icons.section.startup">{{ m.startup_dashboard_section_title() }}</UiIconedRow>
    </template>
    <UiSettingRow :name="m.startup_open_note_title()">
      <template #description>{{ m.startup_open_note_desc() }}</template>
      <UiDropdown v-model="journalName" :aria-label="m.startup_open_note_title()">
        <option value="">{{ m.startup_dont_open_option() }}</option>
        <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
      </UiDropdown>
    </UiSettingRow>
    <UiSettingRow :name="m.note_creation_devices_title()">
      <template #description>{{ m.note_creation_devices_desc() }}</template>
      <UiDropdown v-model="devices" :aria-label="m.note_creation_devices_title()">
        <option value="all">{{ m.note_creation_devices_all() }}</option>
        <option value="desktop">{{ m.note_creation_devices_desktop() }}</option>
        <option value="mobile">{{ m.note_creation_devices_mobile() }}</option>
      </UiDropdown>
    </UiSettingRow>
    <UiSettingRow :name="m.startup_weekday_title()" no-controls>
      <template #description>{{ m.startup_weekday_desc() }}</template>
    </UiSettingRow>
    <UiSettingRow v-for="(entry, index) of overrides" :key="index" controls-only>
      <UiToggleGroup
        :model-value="entry.weekdays"
        :options="weekdayOptionsFor(index)"
        :aria-label="m.startup_weekday_days_label()"
        @update:model-value="patchOverride(index, { weekdays: $event.toSorted((a, b) => a - b) })"
      />
      <UiDropdown
        :model-value="entry.journalName"
        :aria-label="m.startup_weekday_journal_label()"
        @update:model-value="patchOverride(index, { journalName: $event ?? '' })"
      >
        <option value="">{{ m.startup_dont_open_option() }}</option>
        <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
      </UiDropdown>
      <UiIconButton :icon="icons.action.delete" :tooltip="m.startup_weekday_remove()" @click="removeOverride(index)" />
    </UiSettingRow>
    <UiSettingRow controls-only>
      <UiButton @click="addOverride">{{ m.startup_weekday_add() }}</UiButton>
    </UiSettingRow>
  </UiCollapsibleBlock>
</template>
