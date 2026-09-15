<script setup lang="ts">
import { computed, ref } from "vue";

import { formatConjunction, m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { SettingsService } from "@/settings";
import { manual } from "@/ui/manual";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { ImportFromPluginsFlow } from "../flows/import.flow";
import { importOffer } from "../offer";
import { ImportPlanner, type ImportPlan } from "../planner";
import { importNoticeSlice } from "../settings/slice";

import { sourceName } from "./source-names";

const planner = useService(ImportPlanner);
const flows = useService(Flows);
const notice = useService(SettingsService).getSlice(importNoticeSlice);

// Read at setup and after an import, not continuously: other plugins' settings are not reactive,
// so a plugin enabled while this page is open shows up only the next time this component is created.
const plan = ref<ImportPlan | undefined>(planner.plan());
function refresh(): void {
  plan.value = planner.plan();
}

const offer = computed(() => (plan.value === undefined ? undefined : importOffer(plan.value)));
const visible = computed(() => !notice.state.dismissed && (offer.value?.count ?? 0) > 0);

async function runImport(): Promise<void> {
  await flows.invoke(ImportFromPluginsFlow);
  refresh();
}

function dismiss(): void {
  notice.state = { dismissed: true };
}
</script>

<template>
  <div v-if="visible && offer" class="import-notice">
    <UiSettingRow heading :name="m.import_notice_heading()" :help="manual.guides.importing" />
    <UiSettingRow>
      <template #description>
        {{ m.import_notice_message({ sources: formatConjunction(offer.sources.map(sourceName)), count: offer.count }) }}
      </template>
    </UiSettingRow>
    <UiSettingRow controls-only>
      <UiButton @click="dismiss">{{ m.import_notice_dismiss() }}</UiButton>
      <UiButton cta @click="runImport">{{ m.import_action() }}</UiButton>
    </UiSettingRow>
  </div>
</template>

<style scoped>
.import-notice {
  border: 1px solid var(--interactive-accent);
  padding: var(--size-2-2);
}
.import-notice :deep(.setting-item) {
  padding: 0;
}
</style>
