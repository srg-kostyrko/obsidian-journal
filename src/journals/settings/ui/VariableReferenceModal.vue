<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { ModalService } from "@/infrastructure/host/modals";

import { dateModificationsModal } from "./date-modifications-modal";
import I18nWithSlot from "./I18nWithSlot.vue";
import VariableChip from "./VariableChip.vue";

import type { VariableModalContext } from "./variable-context";

const props = defineProps<{
  context: VariableModalContext;
  journalName: string;
  dateFormat: string;
  hasCycle: boolean;
  numberingVariableNames: readonly string[];
}>();

const modals = useService(ModalService);
const NON_INVERTIBLE_CONTEXTS = new Set<VariableModalContext>(["name-template", "folder-path"]);
const showInvertibilityWarning = computed(() => NON_INVERTIBLE_CONTEXTS.has(props.context));

function openModifications(event: Event): void {
  event.preventDefault();
  void modals.open(dateModificationsModal, {});
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
          <a href="#" @click="openModifications">
            {{ m.journal_edit_variable_additional_modifications_link() }}
          </a>
        </dd>
      </div>

      <div class="variable-reference__row">
        <dt><VariableChip :name="`date:${dateFormat}`" /></dt>
        <dd>{{ m.journal_edit_variable_date_format_description() }}</dd>
      </div>

      <div class="variable-reference__row">
        <dt><VariableChip name="journal_name" /></dt>
        <dd>{{ m.journal_edit_variable_journal_name_description({ name: journalName }) }}</dd>
      </div>

      <template v-if="hasCycle">
        <div class="variable-reference__row">
          <dt><VariableChip name="start_date" /></dt>
          <dd>
            {{ m.journal_edit_variable_start_date_description() }}
            <a href="#" @click="openModifications">
              {{ m.journal_edit_variable_additional_modifications_link() }}
            </a>
          </dd>
        </div>
        <div class="variable-reference__row">
          <dt><VariableChip name="end_date" /></dt>
          <dd>
            {{ m.journal_edit_variable_end_date_description() }}
            <a href="#" @click="openModifications">
              {{ m.journal_edit_variable_additional_modifications_link() }}
            </a>
          </dd>
        </div>
      </template>

      <div v-for="numberingName in numberingVariableNames" :key="numberingName" class="variable-reference__row">
        <dt><VariableChip :name="numberingName" /></dt>
        <dd>{{ m.journal_edit_variable_numbering_description() }}</dd>
      </div>

      <div class="variable-reference__row">
        <dt><VariableChip name="current_date" /></dt>
        <dd>
          {{ m.journal_edit_variable_current_date_description() }}
          <a href="#" @click="openModifications">
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
          <a href="#" @click="openModifications">
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
          <a href="#" @click="openModifications">
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
.variable-reference__list {
  display: grid;
  gap: 0.75em;
}
.variable-reference__row {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.75em;
  align-items: baseline;
}
.variable-reference__warning {
  margin-top: 0.25em;
  font-size: 0.85em;
  color: var(--text-warning, var(--text-muted));
}
</style>
