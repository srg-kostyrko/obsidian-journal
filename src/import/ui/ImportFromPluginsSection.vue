<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { SettingsService } from "@/settings";
import { manual } from "@/ui/manual";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { ImportFromPluginsFlow } from "../flows/import.flow";
import { hasAnythingToImport, ImportPlanner, type ImportPlan } from "../planner";

const planner = useService(ImportPlanner);
const flows = useService(Flows);
const settings = useService(SettingsService);

// Read at setup and after an import, not continuously: other plugins' settings are not reactive,
// so a plugin enabled while this page is open shows up only the next time this component is created.
const plan = ref<ImportPlan | undefined>(planner.plan());
function refresh(): void {
  plan.value = planner.plan();
}

const available = computed(
  () => plan.value !== undefined && (plan.value.readings.length > 0 || plan.value.unrecognised.length > 0),
);
const locked = computed(() => settings.lockedByNewerVersion.value);
const canImport = computed(() => !locked.value && plan.value !== undefined && hasAnythingToImport(plan.value));

async function runImport(): Promise<void> {
  await flows.invoke(ImportFromPluginsFlow);
  refresh();
}
</script>

<template>
  <UiSettingRow heading :name="m.import_section_heading()" :help="manual.guides.importing" />
  <UiSettingRow>
    <template #description>
      <div>{{ m.import_section_description() }}</div>
      <div v-if="locked">{{ m.import_section_locked() }}</div>
      <div v-else-if="plan && !available">{{ m.import_section_none() }}</div>
      <div v-else-if="plan && !canImport">{{ m.import_section_nothing() }}</div>
    </template>
    <UiButton :disabled="!canImport" @click="runImport">{{ m.import_action() }}</UiButton>
  </UiSettingRow>
</template>
