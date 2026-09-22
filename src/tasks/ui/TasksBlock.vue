<script setup lang="ts">
import { ref, type Component } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { icons } from "@/ui/icons";
import { manual } from "@/ui/manual";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";

import { TaskProviderToken, type TaskProvider } from "../types";

// note-property (a later phase) joins this block as a second section rather than a second
// top-level block, so the sections rendered here come from whatever is registered under
// TaskProviderToken — this component never names a provider by id.
function hasSettingsSection(provider: TaskProvider): provider is TaskProvider & { settingsSection: Component } {
  return provider.settingsSection !== undefined;
}

const sections = useService(TaskProviderToken).filter(hasSettingsSection);
const expanded = ref(false);
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded" :help="manual.tasks.page">
    <template #trigger>
      <UiIconedRow :icon="icons.section.tasks">{{ m.tasks_settings_title() }}</UiIconedRow>
    </template>
    <component :is="provider.settingsSection" v-for="provider in sections" :key="provider.id" />
  </UiCollapsibleBlock>
</template>
