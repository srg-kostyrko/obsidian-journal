<script setup lang="ts">
import { computed, reactive } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModal } from "@/infrastructure/host/modals";
import FolderInput from "@/journals/settings/ui/FolderInput.vue";
import { SettingsService } from "@/settings";
import { taskDateChoiceLabel } from "@/tasks/ui/date-choice-label";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiPropertySuggest from "@/ui/UiPropertySuggest.vue";
import UiSegmentedControl from "@/ui/UiSegmentedControl.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

import { draftFrom, NOTE_PROPERTY_DATE_ROLES, notePropertyFormErrors, stateFrom } from "../form";
import { notePropertySlice } from "../slice";

import StatusValuesEditor from "./StatusValuesEditor.vue";

const api = useModal();
const slice = useService(SettingsService).getSlice(notePropertySlice);

// draftFrom copies every field, so nothing below reaches settings until Save.
const draft = reactive(draftFrom(slice.state));

const identifyOptions = computed(() => [
  { value: "tag" as const, label: m.tasks_settings_condition_tag() },
  { value: "property" as const, label: m.tasks_note_property_identify_property() },
]);

const errorBag = computed(() => notePropertyFormErrors(draft));
const valid = computed(() => Object.keys(errorBag.value).length === 0);

function addFolder(): void {
  draft.excludedFolders.push("");
}

function removeFolder(index: number): void {
  draft.excludedFolders.splice(index, 1);
}

function save(): void {
  if (!valid.value) return;
  // Every field but `enabled`, which the dashboard row owns, so a toggle flipped while the modal
  // is open survives.
  Object.assign(slice.state, stateFrom(draft));
  api.submit();
}
</script>

<template>
  <UiSettingRow :name="m.tasks_note_property_identify()">
    <UiSegmentedControl v-model="draft.by" :options="identifyOptions" data-testid="note-property-identify" />
  </UiSettingRow>
  <UiSettingRow v-if="draft.by === 'tag'" :name="m.tasks_settings_condition_tag()">
    <template #description>
      <span v-for="error of errorBag.tag" :key="error" class="tasks-note-property-form-error">{{ error }}</span>
    </template>
    <UiTextInput v-model="draft.tag" placeholder="#task" data-testid="note-property-tag" />
  </UiSettingRow>
  <template v-else>
    <UiSettingRow :name="m.common_label_property_name()">
      <template #description>
        <span v-for="error of errorBag.propertyName" :key="error" class="tasks-note-property-form-error">
          {{ error }}
        </span>
      </template>
      <UiPropertySuggest
        v-model="draft.propertyName"
        :aria-label="m.common_label_property_name()"
        data-testid="note-property-property-name"
      />
    </UiSettingRow>
    <UiSettingRow :name="m.tasks_note_property_value()">
      <template #description>{{ m.tasks_note_property_value_desc() }}</template>
      <UiTextInput v-model="draft.propertyValue" data-testid="note-property-property-value" />
    </UiSettingRow>
  </template>

  <UiSettingRow :name="m.tasks_note_property_excluded_folders()" stacked>
    <template #description>{{ m.tasks_note_property_excluded_folders_desc() }}</template>
    <div class="tasks-note-property-list">
      <div v-for="(_, index) in draft.excludedFolders" :key="index" class="tasks-note-property-list-row">
        <FolderInput
          v-model="draft.excludedFolders[index]"
          :aria-label="m.tasks_note_property_folder_label()"
          :data-testid="`note-property-folder-${index}`"
        />
        <UiIconButton
          :icon="icons.action.delete"
          :tooltip="m.common_action_delete()"
          :data-testid="`note-property-folder-remove-${index}`"
          @click="removeFolder(index)"
        />
      </div>
      <div>
        <UiButton data-testid="note-property-add-folder" @click="addFolder">
          {{ m.tasks_note_property_add_folder() }}
        </UiButton>
      </div>
    </div>
  </UiSettingRow>
  <UiSettingRow :name="m.tasks_note_property_archive_tag()">
    <template #description>{{ m.tasks_note_property_archive_tag_desc() }}</template>
    <UiTextInput v-model="draft.archiveTag" data-testid="note-property-archive-tag" />
  </UiSettingRow>

  <UiSettingRow :name="m.tasks_note_property_dates()" heading>
    <template #description>{{ m.tasks_note_property_dates_desc() }}</template>
  </UiSettingRow>
  <UiSettingRow v-for="role in NOTE_PROPERTY_DATE_ROLES" :key="role" :name="taskDateChoiceLabel(role)">
    <UiPropertySuggest
      v-model="draft.dates[role]"
      :aria-label="taskDateChoiceLabel(role)"
      :data-testid="`note-property-date-${role}`"
    />
  </UiSettingRow>

  <UiSettingRow :name="m.tasks_note_property_status_property()">
    <template #description>
      <span v-for="error of errorBag.statusProperty" :key="error" class="tasks-note-property-form-error">
        {{ error }}
      </span>
    </template>
    <UiPropertySuggest
      v-model="draft.statusProperty"
      :aria-label="m.tasks_note_property_status_property()"
      data-testid="note-property-status-property"
    />
  </UiSettingRow>
  <UiSettingRow :name="m.tasks_note_property_status_values()" stacked>
    <template #description>
      {{ m.tasks_note_property_status_values_desc() }}
      <span v-for="error of errorBag.statusRows" :key="error" class="tasks-note-property-form-error">{{ error }}</span>
    </template>
    <StatusValuesEditor v-model:rows="draft.statusRows" v-model:canonical="draft.canonical" />
  </UiSettingRow>

  <UiSettingRow :name="m.tasks_note_property_title_property()">
    <template #description>{{ m.tasks_note_property_title_property_desc() }}</template>
    <UiPropertySuggest
      v-model="draft.titleProperty"
      :aria-label="m.tasks_note_property_title_property()"
      data-testid="note-property-title-property"
    />
  </UiSettingRow>
  <UiSettingRow :name="m.tasks_note_property_modified_property()">
    <template #description>{{ m.tasks_note_property_modified_property_desc() }}</template>
    <UiPropertySuggest
      v-model="draft.modifiedProperty"
      :aria-label="m.tasks_note_property_modified_property()"
      data-testid="note-property-modified-property"
    />
  </UiSettingRow>
  <UiSettingRow :name="m.tasks_note_property_recurrence_properties()">
    <template #description>{{ m.tasks_note_property_recurrence_properties_desc() }}</template>
    <UiTextInput v-model="draft.recurrenceProperties" data-testid="note-property-recurrence" />
  </UiSettingRow>

  <UiSettingRow controls-only>
    <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
    <UiButton cta :disabled="!valid" @click="save">{{ m.common_action_submit() }}</UiButton>
  </UiSettingRow>
</template>

<style scoped>
.tasks-note-property-form-error {
  color: var(--text-error);
  display: block;
}
.tasks-note-property-list {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-2);
}
.tasks-note-property-list-row {
  display: flex;
  align-items: center;
  gap: var(--size-2-2);
}
</style>
