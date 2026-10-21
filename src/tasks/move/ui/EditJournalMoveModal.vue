<script setup lang="ts">
import { computed, reactive } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModal } from "@/infrastructure/host/modals";
import { SettingsService } from "@/settings";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { moveDefaultsSlice, type JournalMoveConfig } from "../settings";

import { configFrom, draftBlocksAutomatic, draftFrom, journalMoveErrors, stampChoice } from "./form";

// Store-agnostic: the caller re-reads its journal after this resolves and writes the result back.
const { move } = defineProps<{ move: JournalMoveConfig }>();
const api = useModal<JournalMoveConfig>();
const defaults = useService(SettingsService).getSlice(moveDefaultsSlice);

const draft = reactive(draftFrom(move));
const errorBag = computed(() => journalMoveErrors(draft, defaults.state));
const blocked = computed(() => draftBlocksAutomatic(draft, defaults.state));
const valid = computed(() => Object.keys(errorBag.value).length === 0);

function save(): void {
  if (!valid.value) return;
  api.submit(configFrom(draft));
}
</script>

<template>
  <UiSettingRow :name="m.tasks_move_mode()">
    <template #description>{{ m.tasks_move_mode_desc() }}</template>
    <UiDropdown v-model="draft.mode" data-testid="move-mode">
      <option value="default">{{ m.tasks_move_mode_default({ mode: defaults.state.mode }) }}</option>
      <option value="copy">{{ m.tasks_move_mode_copy() }}</option>
      <option value="move">{{ m.tasks_move_mode_move() }}</option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow :name="m.tasks_move_stamp()">
    <template #description>{{ m.tasks_move_stamp_desc() }}</template>
    <UiDropdown v-model="draft.stamp" data-testid="move-stamp">
      <option value="default">{{ m.tasks_move_stamp_default({ stamp: stampChoice(defaults.state.stamp) }) }}</option>
      <option value="on">{{ m.tasks_move_stamp_on() }}</option>
      <option value="off">{{ m.tasks_move_stamp_off() }}</option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow :name="m.view_block_tasks_source_label()">
    <template #description>{{ m.tasks_move_source_desc() }}</template>
    <UiDropdown v-model="draft.source" data-testid="move-source">
      <option value="note">{{ m.view_block_tasks_source_note() }}</option>
      <option value="notelets">{{ m.view_block_tasks_source_notelets() }}</option>
      <option value="both">{{ m.view_block_tasks_source_both() }}</option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow :name="m.tasks_move_heading()">
    <template #description>{{ m.tasks_move_heading_desc() }}</template>
    <UiTextInput v-model="draft.targetHeading" placeholder="Tasks" data-testid="move-heading" />
  </UiSettingRow>
  <UiSettingRow :name="m.tasks_move_look_back()">
    <template #description>
      {{ m.tasks_move_look_back_desc() }}
      <span v-for="error of errorBag.lookBack" :key="error" class="tasks-move-form-error">{{ error }}</span>
    </template>
    <UiNumberInput v-model="draft.lookBack" :min="1" :step="1" narrow data-testid="move-look-back" />
  </UiSettingRow>
  <UiSettingRow :name="m.tasks_move_automatic_label()">
    <template #description>
      {{ m.tasks_move_automatic_desc() }}
      <span v-if="blocked && !draft.automatic" class="tasks-move-form-note">{{
        m.tasks_move_automatic_needs_stamp()
      }}</span>
      <span v-for="error of errorBag.automatic" :key="error" class="tasks-move-form-error">{{ error }}</span>
    </template>
    <!-- Stays switchable while on, or a blocked draft could never be fixed by turning it off. -->
    <UiToggle
      v-model="draft.automatic"
      :disabled="blocked && !draft.automatic"
      :tooltip="m.tasks_move_automatic_label()"
      data-testid="move-automatic"
    />
  </UiSettingRow>
  <UiSettingRow controls-only>
    <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
    <UiButton cta :disabled="!valid" @click="save">{{ m.common_action_submit() }}</UiButton>
  </UiSettingRow>
</template>

<style scoped>
.tasks-move-form-note {
  color: var(--text-muted);
  display: block;
}

.tasks-move-form-error {
  color: var(--text-error);
  display: block;
}
</style>
