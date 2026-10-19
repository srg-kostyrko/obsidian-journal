<script setup lang="ts">
import { computed, reactive } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModal } from "@/infrastructure/host/modals";
import { JournalsRepository } from "@/journals/repository";
import FolderInput from "@/journals/settings/ui/FolderInput.vue";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiPropertySuggest from "@/ui/UiPropertySuggest.vue";
import UiSegmentedControl from "@/ui/UiSegmentedControl.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

import { NOTE_PROPERTY_PROVIDER_ID } from "../slice";
import { emptyCondition, visibilityDraftFrom, visibilityFormErrors, visibilityFrom } from "../visibility-form";

import type { VisibilityCondition } from "../visibility";

const { journalName } = defineProps<{ journalName: string }>();

const api = useModal();
const journals = useService(JournalsRepository);

const draft = reactive(
  visibilityDraftFrom(journals.get(journalName).getOrUndefined()?.tasks.providers[NOTE_PROPERTY_PROVIDER_ID]),
);

const showOptions = [
  { value: "all" as const, label: m.tasks_note_visibility_show_all() },
  { value: "matching" as const, label: m.tasks_note_visibility_show_matching() },
  { value: "none" as const, label: m.tasks_note_visibility_show_none() },
];

const errorBag = computed(() => visibilityFormErrors(draft));
const valid = computed(() => errorBag.value.size === 0);

// Each type keeps its values in a field the others lack, so a switch replaces the whole row.
function setType(index: number, type: string): void {
  draft.conditions[index] = emptyCondition(type as VisibilityCondition["type"]);
}

function save(): void {
  if (!valid.value) return;
  // Re-read across the modal's lifetime: the rest of the journal's task settings must come from the
  // current config, not the one this modal opened on.
  const config = journals.get(journalName);
  if (config.isNone()) {
    api.cancel();
    return;
  }
  journals.update(journalName, {
    tasks: {
      ...config.value.tasks,
      providers: { ...config.value.tasks.providers, [NOTE_PROPERTY_PROVIDER_ID]: visibilityFrom(draft) },
    },
  });
  api.submit();
}
</script>

<template>
  <UiSettingRow :name="m.tasks_note_visibility_show()">
    <template #description>{{ m.tasks_note_visibility_show_desc() }}</template>
    <UiSegmentedControl v-model="draft.show" :options="showOptions" data-testid="note-visibility-show" />
  </UiSettingRow>
  <UiSettingRow v-if="draft.show === 'matching'" :name="m.tasks_note_visibility_conditions()" stacked>
    <template #description>{{ m.tasks_note_visibility_conditions_desc() }}</template>
    <div class="tasks-note-visibility-body">
      <UiDropdown v-model="draft.mode" :aria-label="m.tasks_note_visibility_mode()" data-testid="note-visibility-mode">
        <option value="and">{{ m.tasks_settings_mode_and() }}</option>
        <option value="or">{{ m.tasks_settings_mode_or() }}</option>
      </UiDropdown>
      <div
        v-for="(condition, index) in draft.conditions"
        :key="condition.id"
        class="tasks-note-visibility-condition"
        data-testid="note-visibility-condition"
      >
        <div class="tasks-note-visibility-condition-row">
          <UiDropdown
            :model-value="condition.type"
            data-testid="note-visibility-condition-type"
            @update:model-value="setType(index, $event)"
          >
            <option value="tag">{{ m.tasks_settings_condition_tag() }}</option>
            <option value="folder">{{ m.tasks_note_property_folder_label() }}</option>
            <option value="property">{{ m.tasks_note_property_identify_property() }}</option>
          </UiDropdown>
          <UiTextInput
            v-if="condition.type === 'tag'"
            v-model="condition.tags"
            placeholder="#work"
            :aria-label="m.tasks_settings_condition_tag()"
          />
          <div v-else-if="condition.type === 'folder'" class="tasks-note-visibility-list">
            <div v-for="(_, at) in condition.folders" :key="at" class="tasks-note-visibility-list-row">
              <FolderInput v-model="condition.folders[at]" :aria-label="m.tasks_note_property_folder_label()" />
              <UiIconButton
                :icon="icons.action.delete"
                :tooltip="m.common_action_delete()"
                @click="condition.folders.splice(at, 1)"
              />
            </div>
            <div>
              <UiButton @click="condition.folders.push('')">{{ m.tasks_note_property_add_folder() }}</UiButton>
            </div>
          </div>
          <div v-else class="tasks-note-visibility-list">
            <UiPropertySuggest v-model="condition.name" :aria-label="m.common_label_property_name()" />
            <div v-for="(_, at) in condition.values" :key="at" class="tasks-note-visibility-list-row">
              <UiTextInput v-model="condition.values[at]" :aria-label="m.tasks_note_property_value()" />
              <UiIconButton
                :icon="icons.action.delete"
                :tooltip="m.common_action_delete()"
                @click="condition.values.splice(at, 1)"
              />
            </div>
            <div>
              <UiButton @click="condition.values.push('')">{{ m.tasks_note_property_add_value() }}</UiButton>
            </div>
          </div>
          <UiIconButton
            :icon="icons.action.delete"
            :tooltip="m.common_action_delete()"
            data-testid="note-visibility-remove-condition"
            @click="draft.conditions.splice(index, 1)"
          />
        </div>
        <span v-for="error of errorBag.get(condition.id)" :key="error" class="tasks-note-property-form-error">
          {{ error }}
        </span>
      </div>
      <div class="tasks-note-visibility-actions">
        <UiButton data-testid="note-visibility-add-condition" @click="draft.conditions.push(emptyCondition('tag'))">
          {{ m.tasks_settings_add_condition() }}
        </UiButton>
      </div>
    </div>
  </UiSettingRow>
  <UiSettingRow controls-only>
    <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
    <UiButton cta :disabled="!valid" @click="save">{{ m.common_action_submit() }}</UiButton>
  </UiSettingRow>
</template>

<style scoped>
.tasks-note-visibility-body,
.tasks-note-visibility-list {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-2);
}
.tasks-note-visibility-condition-row {
  display: grid;
  grid-template-columns: 8em 1fr auto;
  align-items: start;
  gap: var(--size-2-2);
}
.tasks-note-visibility-list-row {
  display: flex;
  align-items: center;
  gap: var(--size-2-2);
}
.tasks-note-visibility-actions {
  display: flex;
  justify-content: flex-end;
}
.tasks-note-property-form-error {
  color: var(--text-error);
  display: block;
}
</style>
