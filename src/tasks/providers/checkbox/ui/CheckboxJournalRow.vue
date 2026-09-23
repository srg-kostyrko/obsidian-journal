<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { JournalsRepository } from "@/journals/repository";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { EditJournalTasksFlow } from "../flows/edit-journal-tasks.flow";

import { describeJournalRule } from "./describe-rule";

const { journalName } = defineProps<{ journalName: string }>();

const flows = useService(Flows);
const journals = useService(JournalsRepository);

const summary = computed(() => describeJournalRule(journals.get(journalName).getOrUndefined()?.tasks.checkbox));

function configure(): void {
  void flows.invoke(EditJournalTasksFlow, { journalName });
}
</script>

<template>
  <UiSettingRow :name="m.tasks_settings_provider_checkbox()">
    <template #description>
      <span data-testid="checkbox-journal-summary">{{ summary }}</span>
    </template>
    <UiButton data-testid="checkbox-journal-edit" @click="configure">{{ m.tasks_settings_edit_rule() }}</UiButton>
  </UiSettingRow>
</template>
