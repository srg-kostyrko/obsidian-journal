<script setup lang="ts">
import { computed, ref } from "vue";

import {
  calendarDisplaySlice,
  vaultDayNotesSortDirection,
  vaultDayNotesSortField,
  withVaultDayNotesSortDirection,
  withVaultDayNotesSortField,
  type VaultDayNotesSortDirection,
  type VaultDayNotesSortField,
} from "@/calendar/settings/display-slice";
import type { ColorSettings } from "@/decorations";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { appearanceSlice } from "@/notes-calendar/appearance/slice";
import { SettingsService } from "@/settings";
import { icons } from "@/ui/icons";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiColorSettingsPicker from "@/ui/UiColorSettingsPicker.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

const settings = useService(SettingsService);
const displaySlice = settings.getSlice(calendarDisplaySlice);
const appearance = settings.getSlice(appearanceSlice);
const expanded = ref(false);

const vaultDayNotes = computed({
  get: () => displaySlice.state.vaultDayNotes,
  set: (vaultDayNotes: boolean) => {
    displaySlice.state = { ...displaySlice.state, vaultDayNotes };
  },
});

const sortField = computed({
  get: () => vaultDayNotesSortField(displaySlice.state.vaultDayNotesSort),
  set: (field: VaultDayNotesSortField) => {
    displaySlice.state = {
      ...displaySlice.state,
      vaultDayNotesSort: withVaultDayNotesSortField(displaySlice.state.vaultDayNotesSort, field),
    };
  },
});

const sortDirection = computed({
  get: () => vaultDayNotesSortDirection(displaySlice.state.vaultDayNotesSort),
  set: (direction: VaultDayNotesSortDirection) => {
    displaySlice.state = {
      ...displaySlice.state,
      vaultDayNotesSort: withVaultDayNotesSortDirection(displaySlice.state.vaultDayNotesSort, direction),
    };
  },
});

const showJournalNotes = computed({
  get: () => displaySlice.state.vaultDayNotesIncludeJournals,
  set: (vaultDayNotesIncludeJournals: boolean) => {
    displaySlice.state = { ...displaySlice.state, vaultDayNotesIncludeJournals };
  },
});

function setSelectedBackground(selectedBackground: ColorSettings): void {
  appearance.state = { ...appearance.state, selectedBackground };
}
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded">
    <template #trigger>
      <UiIconedRow :icon="icons.section.notePreview">{{ m.calendar_noteview_section_title() }}</UiIconedRow>
    </template>
    <UiSettingRow :name="m.calendar_noteview_toggle_label()">
      <template #description>{{ m.calendar_noteview_toggle_description() }}</template>
      <UiToggle v-model="vaultDayNotes" />
    </UiSettingRow>
    <fieldset class="vault-notes-preview-settings" :disabled="!vaultDayNotes">
      <UiSettingRow :name="m.calendar_noteview_sort_field_label()">
        <UiDropdown
          :model-value="sortField"
          :disabled="!vaultDayNotes"
          @update:model-value="(v) => (sortField = v as VaultDayNotesSortField)"
        >
          <option value="modified">{{ m.calendar_noteview_sort_modified() }}</option>
          <option value="name">{{ m.calendar_noteview_sort_name() }}</option>
        </UiDropdown>
      </UiSettingRow>
      <UiSettingRow :name="m.calendar_noteview_sort_direction_label()">
        <UiDropdown
          :model-value="sortDirection"
          :disabled="!vaultDayNotes"
          @update:model-value="(v) => (sortDirection = v as VaultDayNotesSortDirection)"
        >
          <option value="asc">{{ m.calendar_noteview_sort_ascending() }}</option>
          <option value="desc">{{ m.calendar_noteview_sort_descending() }}</option>
        </UiDropdown>
      </UiSettingRow>
      <UiSettingRow :name="m.calendar_noteview_include_journals_label()">
        <template #description>{{ m.calendar_noteview_include_journals_description() }}</template>
        <UiToggle v-model="showJournalNotes" :disabled="!vaultDayNotes" />
      </UiSettingRow>
      <UiSettingRow :name="m.calendar_appearance_selected_background()">
        <template #description>{{ m.calendar_appearance_selected_background_description() }}</template>
        <UiColorSettingsPicker
          :model-value="appearance.state.selectedBackground"
          role="background"
          :disabled="!vaultDayNotes"
          @update:model-value="setSelectedBackground"
        />
      </UiSettingRow>
    </fieldset>
  </UiCollapsibleBlock>
</template>

<style scoped>
.vault-notes-preview-settings {
  min-inline-size: 0;
  padding: 0;
  margin: 0;
  border: 0;
}
.vault-notes-preview-settings:disabled {
  opacity: 0.5;
}
</style>
