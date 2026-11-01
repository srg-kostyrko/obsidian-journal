<script setup lang="ts">
import { match } from "ts-pattern";
import { computed, ref, type Component } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { JournalsRepository } from "@/journals/repository";
import { isUnreadable } from "@/settings/repair";
import { icons } from "@/ui/icons";
import { manual } from "@/ui/manual";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";

import JournalMoveRow from "../move/ui/JournalMoveRow.vue";
import { TaskProviderToken, type TaskProvider } from "../types";

import JournalTaskFilterRow from "./JournalTaskFilterRow.vue";

const { journalName } = defineProps<{ journalName: string }>();

function hasJournalRow(provider: TaskProvider): provider is TaskProvider & { journalRow: Component } {
  return provider.journalRow !== undefined;
}

const rows = useService(TaskProviderToken).filter(hasJournalRow);
const expanded = ref(false);

const journals = useService(JournalsRepository);
// The section's own compose value, legible while the block is shut — the way TemplatesSection
// carries a count. Reads the checkbox provider's rule directly rather than through a generic
// provider hook: it is the only provider with journal-scoped compose today.
// A rule held unreadable has no relation to name; the row inside says what it does instead.
const compose = computed(() => {
  const rule = journals.get(journalName).getOrUndefined()?.tasks.providers.checkbox;
  return isUnreadable(rule) ? undefined : (rule?.compose ?? "inherit");
});
const composeLabel = computed(() => {
  if (compose.value === undefined) return;
  return match(compose.value)
    .with("narrow", () => m.tasks_journal_compose_narrow())
    .with("replace", () => m.tasks_journal_compose_replace())
    .with("inherit", () => m.tasks_journal_compose_inherit())
    .exhaustive();
});
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded" :help="manual.tasks.journalRule">
    <template #trigger>
      <UiIconedRow :icon="icons.section.tasks">
        {{ m.tasks_settings_title() }}
        <span v-if="composeLabel !== undefined" class="flair">{{ composeLabel }}</span>
      </UiIconedRow>
    </template>
    <component :is="provider.journalRow" v-for="provider in rows" :key="provider.id" :journal-name="journalName" />
    <!-- Not provider-specific — the listing filter decides which tasks a listing shows, not what
         counts as a task, so it renders as its own row rather than inside a provider's. -->
    <JournalTaskFilterRow :journal-name="journalName" />
    <JournalMoveRow :journal-name="journalName" />
  </UiCollapsibleBlock>
</template>
