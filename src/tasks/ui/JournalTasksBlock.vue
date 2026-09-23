<script setup lang="ts">
import { ref, type Component } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { icons } from "@/ui/icons";
import { manual } from "@/ui/manual";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";

import { TaskProviderToken, type TaskProvider } from "../types";

defineProps<{ journalName: string }>();

function hasJournalRow(provider: TaskProvider): provider is TaskProvider & { journalRow: Component } {
  return provider.journalRow !== undefined;
}

const rows = useService(TaskProviderToken).filter(hasJournalRow);
const expanded = ref(false);
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded" :help="manual.tasks.journalRule">
    <template #trigger>
      <UiIconedRow :icon="icons.section.tasks">{{ m.tasks_settings_title() }}</UiIconedRow>
    </template>
    <component :is="provider.journalRow" v-for="provider in rows" :key="provider.id" :journal-name="journalName" />
  </UiCollapsibleBlock>
</template>
