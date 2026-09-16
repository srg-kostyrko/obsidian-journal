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
// A dismissed notice reads nothing: another plugin's getter is foreign code on every dashboard open.
const plan = ref<ImportPlan | undefined>(notice.state.dismissed ? undefined : planner.plan());
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
/* One card, not a box around cards: Obsidian fills and rounds every .setting-item itself, so the
   rows have to be flattened or the notice reads as a container of three separate things. Sized from
   Obsidian's own variables rather than the values it happens to use today — the settings chrome has
   already drifted once across the range this plugin supports. */
.import-notice {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-inline-start: 3px solid var(--interactive-accent);
  border-radius: var(--radius-m);
  padding: var(--size-4-3) var(--size-4-4);
  margin-block-end: var(--size-4-5);
  display: flex;
  flex-direction: column;
  gap: var(--size-4-2);
}
/* The margin matters as much as the padding: Obsidian spaces settings rows with a bottom margin of
   its own — 16px under a heading — which stacks on top of the gap here and leaves the last row's
   share of it sitting above the card's own padding. */
.import-notice :deep(.setting-item) {
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  border-radius: 0;
}
</style>
