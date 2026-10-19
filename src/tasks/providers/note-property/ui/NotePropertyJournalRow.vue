<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { JournalsRepository } from "@/journals/repository";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { EditJournalTaskNotesFlow } from "../flows/edit-journal-task-notes.flow";
import { NOTE_PROPERTY_PROVIDER_ID } from "../slice";

import { describeVisibility } from "./describe-visibility";

const { journalName } = defineProps<{ journalName: string }>();

const flows = useService(Flows);
const journals = useService(JournalsRepository);

const summary = computed(() =>
  describeVisibility(journals.get(journalName).getOrUndefined()?.tasks.providers[NOTE_PROPERTY_PROVIDER_ID]),
);

function configure(): void {
  void flows.invoke(EditJournalTaskNotesFlow, { journalName });
}
</script>

<template>
  <UiSettingRow :name="m.tasks_settings_provider_note_property()">
    <template #description>
      <span data-testid="note-property-journal-summary">{{ summary }}</span>
    </template>
    <UiButton data-testid="note-property-journal-edit" @click="configure">{{ m.tasks_settings_edit_rule() }}</UiButton>
  </UiSettingRow>
</template>
