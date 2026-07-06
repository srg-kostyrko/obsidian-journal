<script setup lang="ts">
import { m } from "@/i18n";
import { useModalService } from "@/infrastructure/host/modals";
import { dateModificationsModal } from "@/templates/ui/modals";
import VariableChip from "@/templates/ui/VariableChip.vue";

const modals = useModalService();

function showModifications(event: Event): void {
  event.preventDefault();
  void modals.open(dateModificationsModal, {});
}
</script>

<template>
  <div class="markdown-template-variables">
    <p>{{ m.view_block_markdown_template_variables_intro() }}</p>
    <dl class="markdown-template-variables__list">
      <div class="markdown-template-variables__row">
        <dt><VariableChip name="date" /></dt>
        <dd>
          {{ m.view_block_markdown_template_variable_date_description() }}
          <a href="#" @click="showModifications">{{ m.journal_edit_variable_additional_modifications_link() }}</a>
        </dd>
      </div>
      <div class="markdown-template-variables__row">
        <dt><VariableChip name="current_date" /></dt>
        <dd>
          {{ m.view_block_markdown_template_variable_current_date_description() }}
          <a href="#" @click="showModifications">{{ m.journal_edit_variable_additional_modifications_link() }}</a>
        </dd>
      </div>
      <div class="markdown-template-variables__row">
        <dt><VariableChip name="time" /></dt>
        <dd>
          {{ m.view_block_markdown_template_variable_time_description() }}
          <a href="#" @click="showModifications">{{ m.journal_edit_variable_additional_modifications_link() }}</a>
        </dd>
      </div>
      <div class="markdown-template-variables__row">
        <dt><VariableChip name="current_time" /></dt>
        <dd>
          {{ m.view_block_markdown_template_variable_current_time_description() }}
          <a href="#" @click="showModifications">{{ m.journal_edit_variable_additional_modifications_link() }}</a>
        </dd>
      </div>
      <div class="markdown-template-variables__row">
        <dt><VariableChip name="journal_link(name)" /></dt>
        <dd>{{ m.view_block_markdown_template_variable_journal_link_description() }}</dd>
      </div>
    </dl>
    <p>
      <a href="https://momentjs.com/docs/#/displaying/format/" target="_blank" rel="noopener">
        {{ m.common_moment_format_reference() }}
      </a>
    </p>
  </div>
</template>

<style scoped>
.markdown-template-variables__list {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 0.75em;
  row-gap: 0.75em;
  align-items: baseline;
}
.markdown-template-variables__row {
  display: contents;
}
</style>
