<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { JournalsRepository } from "@/journals/repository";
import { describeVisibility } from "@/tasks/visibility-rule/describe";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { EditJournalTasksFlow } from "../flows/edit-journal-tasks.flow";

import { describeJournalRule } from "./describe-rule";

const { journalName } = defineProps<{ journalName: string }>();

const flows = useService(Flows);
const journals = useService(JournalsRepository);

const rule = computed(() => journals.get(journalName).getOrUndefined()?.tasks.providers.checkbox);
const summary = computed(() => describeJournalRule(rule.value));
const datedSummary = computed(() =>
  describeVisibility(rule.value?.dated, {
    all: m.tasks_checkbox_dated_summary_all,
    none: m.tasks_checkbox_dated_summary_none,
    matching: m.tasks_checkbox_dated_summary_matching,
  }),
);

function configure(): void {
  void flows.invoke(EditJournalTasksFlow, { journalName });
}
</script>

<template>
  <UiSettingRow :name="m.tasks_settings_provider_checkbox()">
    <template #description>
      <span data-testid="checkbox-journal-summary">{{ summary }}</span>
      <br />
      <span data-testid="checkbox-journal-dated-summary">{{ datedSummary }}</span>
    </template>
    <UiButton data-testid="checkbox-journal-edit" @click="configure">{{ m.tasks_settings_edit_rule() }}</UiButton>
  </UiSettingRow>
</template>
