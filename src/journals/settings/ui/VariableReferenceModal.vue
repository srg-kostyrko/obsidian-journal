<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import VariableChip from "@/templates/ui/VariableChip.vue";
import I18nWithSlot from "@/ui/I18nWithSlot.vue";

import type { VariableReferenceModalProps } from "./modals";

const props = defineProps<VariableReferenceModalProps>();

const NON_INVERTIBLE_CONTEXTS = new Set<VariableReferenceModalProps["context"]>(["name-template", "folder-path"]);
const showInvertibilityWarning = computed(() => NON_INVERTIBLE_CONTEXTS.has(props.context));
const showNavRowVariables = computed(() => props.context === "nav-row");
const showTemplateContentVariables = computed(() => props.context === "template-path");
// note_name/title are bound after the filename renders, so the name template can't use them.
const NOTE_NAME_CONTEXTS = new Set<VariableReferenceModalProps["context"]>(["folder-path", "template-path", "nav-row"]);
const showNoteNameVariables = computed(() => NOTE_NAME_CONTEXTS.has(props.context));

function handleModificationsClick(event: Event): void {
  event.preventDefault();
  props.openModifications();
}
</script>

<template>
  <div class="variable-reference">
    <p>{{ m.journal_edit_variable_reference_intro({ dateFormat }) }}</p>
    <dl class="variable-reference__list">
      <div class="variable-reference__row">
        <dt><VariableChip name="date" /></dt>
        <dd>
          {{ m.journal_edit_variable_date_description() }}
          <a href="#" @click="handleModificationsClick">
            {{ m.journal_edit_variable_additional_modifications_link() }}
          </a>
        </dd>
      </div>

      <div class="variable-reference__row">
        <dt><VariableChip :name="`date:${dateFormat}`" /></dt>
        <dd>{{ m.journal_edit_variable_date_format_description() }}</dd>
      </div>

      <div class="variable-reference__row">
        <dt><VariableChip name="week_of_month" /></dt>
        <dd>
          {{ m.journal_edit_variable_week_of_month_description() }}
          <a href="#" @click="handleModificationsClick">
            {{ m.journal_edit_variable_additional_modifications_link() }}
          </a>
        </dd>
      </div>

      <div class="variable-reference__row">
        <dt><VariableChip name="journal_name" /></dt>
        <dd>{{ m.journal_edit_variable_journal_name_description({ name: journalName }) }}</dd>
      </div>

      <div v-if="showTemplateContentVariables" class="variable-reference__row">
        <dt><VariableChip name="journal_link(journal_name)" /></dt>
        <dd>{{ m.journal_edit_variable_journal_link_description() }}</dd>
      </div>

      <template v-if="showNoteNameVariables">
        <div class="variable-reference__row">
          <dt><VariableChip name="note_name" /></dt>
          <dd>{{ m.journal_edit_variable_note_name_description() }}</dd>
        </div>
        <div class="variable-reference__row">
          <dt><VariableChip name="title" /></dt>
          <dd>{{ m.journal_edit_variable_note_title_description() }}</dd>
        </div>
      </template>

      <template v-if="showNavRowVariables">
        <div class="variable-reference__row">
          <dt><VariableChip name="relative_date" /></dt>
          <dd>{{ m.journal_edit_variable_relative_date_description() }}</dd>
        </div>
      </template>

      <template v-if="hasCycle">
        <div class="variable-reference__row">
          <dt><VariableChip name="start_date" /></dt>
          <dd>
            {{ m.journal_edit_variable_start_date_description() }}
            <a href="#" @click="handleModificationsClick">
              {{ m.journal_edit_variable_additional_modifications_link() }}
            </a>
          </dd>
        </div>
        <div class="variable-reference__row">
          <dt><VariableChip name="end_date" /></dt>
          <dd>
            {{ m.journal_edit_variable_end_date_description() }}
            <a href="#" @click="handleModificationsClick">
              {{ m.journal_edit_variable_additional_modifications_link() }}
            </a>
          </dd>
        </div>
      </template>

      <div v-for="numberingName in numberingVariableNames" :key="numberingName" class="variable-reference__row">
        <dt><VariableChip :name="numberingName" /></dt>
        <dd>
          {{ m.journal_edit_variable_numbering_description() }}
          <a href="#" @click="handleModificationsClick">
            {{ m.journal_edit_variable_additional_modifications_link() }}
          </a>
        </dd>
      </div>

      <div v-for="promptName in promptVariableNames" :key="promptName" class="variable-reference__row">
        <dt><VariableChip :name="promptName" /></dt>
        <dd>{{ m.journal_edit_variable_prompt_description() }}</dd>
      </div>

      <div class="variable-reference__row">
        <dt><VariableChip name="current_date" /></dt>
        <dd>
          {{ m.journal_edit_variable_current_date_description() }}
          <a href="#" @click="handleModificationsClick">
            {{ m.journal_edit_variable_additional_modifications_link() }}
          </a>
          <p v-if="showInvertibilityWarning" class="variable-reference__warning">
            {{ m.journal_edit_variable_non_invertible_warning() }}
          </p>
        </dd>
      </div>

      <div class="variable-reference__row">
        <dt><VariableChip name="time" /></dt>
        <dd>
          {{ m.journal_edit_variable_time_description() }}
          <a href="#" @click="handleModificationsClick">
            {{ m.journal_edit_variable_additional_modifications_link() }}
          </a>
          <p v-if="showInvertibilityWarning" class="variable-reference__warning">
            {{ m.journal_edit_variable_non_invertible_warning() }}
          </p>
        </dd>
      </div>

      <div class="variable-reference__row">
        <dt><VariableChip name="current_time" /></dt>
        <dd>
          <I18nWithSlot :message="m.journal_edit_variable_current_time_description">
            <VariableChip name="time" />
          </I18nWithSlot>
          <a href="#" @click="handleModificationsClick">
            {{ m.journal_edit_variable_additional_modifications_link() }}
          </a>
          <p v-if="showInvertibilityWarning" class="variable-reference__warning">
            {{ m.journal_edit_variable_non_invertible_warning() }}
          </p>
        </dd>
      </div>
    </dl>
  </div>
</template>

<style scoped>
/* One shared grid so every row's chip column is the same width and the
   descriptions line up on a single left edge across all rows. */
.variable-reference__list {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 0.75em;
  row-gap: 0.75em;
  align-items: baseline;
}
.variable-reference__row {
  display: contents;
}
.variable-reference__warning {
  margin-top: 0.25em;
  font-size: 0.85em;
  color: var(--text-warning, var(--text-muted));
}
</style>
