<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModalService } from "@/infrastructure/host/modals";
import { JournalsRepository } from "@/journals/repository";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { describeTaskRule } from "./describe-task-rule";
import { editTaskFilterModal } from "./modals";

const { journalName } = defineProps<{ journalName: string }>();

const modals = useModalService();
const journals = useService(JournalsRepository);

// Not provider-specific — this is the journal's own row, a sibling of each provider's row rather
// than something rendered inside one (see JournalTasksBlock.vue).
const filter = computed(() => journals.get(journalName).getOrUndefined()?.tasks.filter);

const summary = computed(() => {
  const stored = filter.value;
  return !stored || stored.conditions.length === 0 ? m.tasks_journal_filter_none() : describeTaskRule(stored);
});

function edit(): void {
  const current = filter.value ?? { mode: "and" as const, conditions: [] };
  // No mode control: a journal contributes conditions, and composeFilters answers with the
  // surface's own mode (see src/tasks/filter.ts).
  void modals.open(editTaskFilterModal, { filter: current, showMode: false }).tap((next) => {
    // Re-read across the modal's lifetime: the store can change while it is open (a sync merge,
    // or any other write reaching JournalsRepository), so the providers this write must not
    // disturb come from the current config, not the one open when the modal was opened.
    const config = journals.get(journalName);
    if (config.isNone()) return;
    journals.update(journalName, { tasks: { ...config.value.tasks, filter: next } });
  });
}
</script>

<template>
  <UiSettingRow :name="m.tasks_journal_filter_title()">
    <template #description>
      <span data-testid="task-filter-summary">{{ summary }}</span>
    </template>
    <UiButton data-testid="task-filter-edit" @click="edit">{{ m.tasks_journal_filter_edit() }}</UiButton>
  </UiSettingRow>
</template>
