<script setup lang="ts">
import { m } from "@/i18n";

defineProps<{ journalName: string; dateFormat: string; hasNumbering: boolean }>();

const variableDate = "{{date}}";
const variableDateFormat = "{{date:format}}";
const variableJournalName = "{{journal_name}}";
const variableStartDate = "{{start_date}}";
const variableEndDate = "{{end_date}}";
const variableNumbering = "{{<index-variable>}}";
</script>

<template>
  <div class="variable-reference">
    <p>{{ m.journal_edit_variable_reference_intro({ dateFormat }) }}</p>
    <ul>
      <li>
        <code>{{ variableDate }}</code> — {{ m.journal_edit_variable_date_description() }}
      </li>
      <li>
        <code>{{ variableDateFormat }}</code> — {{ m.journal_edit_variable_date_format_description() }}
      </li>
      <li>
        <code>{{ variableJournalName }}</code> —
        {{ m.journal_edit_variable_journal_name_description({ name: journalName }) }}
      </li>
      <li>
        <code>{{ variableStartDate }}</code> — {{ m.journal_edit_variable_start_date_description() }}
      </li>
      <li>
        <code>{{ variableEndDate }}</code> — {{ m.journal_edit_variable_end_date_description() }}
      </li>
      <li v-if="hasNumbering">
        <code>{{ variableNumbering }}</code> — {{ m.journal_edit_variable_numbering_description() }}
      </li>
    </ul>
  </div>
</template>
