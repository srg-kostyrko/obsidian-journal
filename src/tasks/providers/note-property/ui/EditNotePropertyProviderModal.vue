<script setup lang="ts">
import { computed, reactive, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModal } from "@/infrastructure/host/modals";
import FolderInput from "@/journals/settings/ui/FolderInput.vue";
import { SettingsService } from "@/settings";
import { taskDateChoiceLabel } from "@/tasks/ui/date-choice-label";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
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

const identifyOptions = [
  { value: "tag" as const, label: m.tasks_settings_condition_tag() },
  { value: "property" as const, label: m.tasks_note_property_identify_property() },
];

const errorBag = computed(() => notePropertyFormErrors(draft));
const valid = computed(() => Object.keys(errorBag.value).length === 0);

const datesOpen = ref(false);
const otherOpen = ref(false);
const statusOpenByUser = ref(false);
// A closed section would hide the reason Save is disabled, so one holding an error stays open.
const statusOpen = computed({
  get: () =>
    statusOpenByUser.value || errorBag.value.statusProperty !== undefined || errorBag.value.statusRows !== undefined,
  set: (open: boolean) => (statusOpenByUser.value = open),
});
const datesSet = computed(() => NOTE_PROPERTY_DATE_ROLES.filter((role) => draft.dates[role] !== "").length);

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

  <UiSettingRow :name="m.tasks_note_property_excluded_folders()">
    <template #description>{{ m.tasks_note_property_excluded_folders_desc() }}</template>
    <UiIconButton
      :icon="icons.action.add"
      :tooltip="m.tasks_note_property_add_folder()"
      data-testid="note-property-add-folder"
      @click="addFolder"
    />
  </UiSettingRow>
  <UiSettingRow
    v-for="(_, index) in draft.excludedFolders"
    :key="index"
    controls-only
    class="tasks-note-property-folder-row"
  >
    <FolderInput
      v-model="draft.excludedFolders[index]"
      class="tasks-note-property-grow"
      :aria-label="m.tasks_note_property_folder_label()"
      :data-testid="`note-property-folder-${index}`"
    />
    <UiIconButton
      :icon="icons.action.delete"
      :tooltip="m.common_action_delete()"
      :data-testid="`note-property-folder-remove-${index}`"
      @click="removeFolder(index)"
    />
  </UiSettingRow>
  <UiSettingRow :name="m.tasks_note_property_archive_tag()">
    <template #description>{{ m.tasks_note_property_archive_tag_desc() }}</template>
    <UiTextInput v-model="draft.archiveTag" data-testid="note-property-archive-tag" />
  </UiSettingRow>

  <UiCollapsibleBlock v-model:expanded="datesOpen" data-testid="note-property-dates-section">
    <template #trigger>
      <UiIconedRow :icon="icons.section.taskDates">
        {{ m.tasks_note_property_dates() }}
        <span class="flair">{{ datesSet }}</span>
      </UiIconedRow>
    </template>
    <UiSettingRow>
      <template #description>{{ m.tasks_note_property_dates_desc() }}</template>
    </UiSettingRow>
    <UiSettingRow v-for="role in NOTE_PROPERTY_DATE_ROLES" :key="role" :name="taskDateChoiceLabel(role)">
      <UiPropertySuggest
        v-model="draft.dates[role]"
        :aria-label="taskDateChoiceLabel(role)"
        :data-testid="`note-property-date-${role}`"
      />
    </UiSettingRow>
  </UiCollapsibleBlock>

  <UiCollapsibleBlock v-model:expanded="statusOpen" data-testid="note-property-status-section">
    <template #trigger>
      <UiIconedRow :icon="icons.section.taskStatus">
        {{ m.tasks_note_property_status_section() }}
        <span class="flair">{{ draft.statusRows.length }}</span>
      </UiIconedRow>
    </template>
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
    <StatusValuesEditor
      v-model:rows="draft.statusRows"
      v-model:canonical="draft.canonical"
      :errors="errorBag.statusRows"
    />
  </UiCollapsibleBlock>

  <UiCollapsibleBlock v-model:expanded="otherOpen" data-testid="note-property-other-section">
    <template #trigger>
      <UiIconedRow :icon="icons.section.properties">{{ m.tasks_note_property_other_section() }}</UiIconedRow>
    </template>
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
  </UiCollapsibleBlock>

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
.tasks-note-property-folder-row :deep(.setting-item-control) {
  flex: 1;
}
.tasks-note-property-grow {
  flex-grow: 1;
}
</style>
