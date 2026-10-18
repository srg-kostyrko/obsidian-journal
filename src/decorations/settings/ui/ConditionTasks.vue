<script setup lang="ts">
import { useField } from "vee-validate";
import { computed } from "vue";

import type { JournalDecorationTasksCondition } from "@/decorations";
import { m } from "@/i18n";
import RuleEditor from "@/tasks/ui/RuleEditor.vue";
import { statusFilterLabel } from "@/tasks/ui/status-filter-options";
import { taskRuleConditionErrors } from "@/tasks/ui/task-rule-form-schema";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSegmentedControl from "@/ui/UiSegmentedControl.vue";

const { name } = defineProps<{ name: string }>();

const { value: quantifier } = useField<JournalDecorationTasksCondition["quantifier"]>(`${name}.quantifier`);
const { value: status } = useField<JournalDecorationTasksCondition["status"]>(`${name}.status`);
const { value: source } = useField<JournalDecorationTasksCondition["source"]>(`${name}.source`);
const { value: filter } = useField<JournalDecorationTasksCondition["filter"]>(`${name}.filter`);

const statusOptions = [
  { value: "listing" as const, label: m.decoration_condition_tasks_status_listing() },
  { value: "open" as const, label: statusFilterLabel("open") },
  { value: "done" as const, label: statusFilterLabel("done") },
  { value: "all" as const, label: statusFilterLabel("all") },
];

const errors = computed(() => taskRuleConditionErrors(filter.value));
</script>

<template>
  <div class="condition-tasks">
    <div class="condition-tasks-sentence">
      <UiDropdown v-model="quantifier" :aria-label="m.decoration_condition_tasks_quantifier_label()">
        <option v-for="q of ['any', 'all', 'none'] as const" :key="q" :value="q">
          {{ m.decoration_condition_tasks_quantifier_option({ quantifier: q }) }}
        </option>
      </UiDropdown>
      <UiSegmentedControl
        v-model="status"
        :options="statusOptions"
        :aria-label="m.decoration_condition_tasks_status_label()"
      />
      <UiDropdown v-model="source" :aria-label="m.decoration_condition_tasks_source_label()">
        <option value="note">{{ m.view_block_tasks_source_note() }}</option>
        <option value="notelets">{{ m.view_block_tasks_source_notelets() }}</option>
        <option value="both">{{ m.view_block_tasks_source_both() }}</option>
      </UiDropdown>
    </div>
    <RuleEditor
      v-model="filter"
      :types="['heading', 'tag']"
      :label="m.decoration_condition_tasks_narrow_label()"
      :description="m.decoration_condition_tasks_narrow_description()"
      :add-label="m.decoration_condition_tasks_narrow_add()"
      :errors="errors"
      show-mode
    />
  </div>
</template>

<style scoped>
.condition-tasks {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-2);
}
.condition-tasks-sentence {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--size-2-2);
}
</style>
