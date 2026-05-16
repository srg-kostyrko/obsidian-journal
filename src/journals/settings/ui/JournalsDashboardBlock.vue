<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { journalConfigCollection, type JournalConfig } from "@/journals";
import { SettingsService, SettingsUiService } from "@/settings";
import UiButton from "@/ui/UiButton.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { describeWrite } from "../describe-write";
import { AddJournalFlow } from "../flows/add-journal.flow";
import { DeleteJournalFlow } from "../flows/delete-journal.flow";
import { RenameJournalFlow } from "../flows/rename-journal.flow";

import { journalEditSubpage } from "./journals-subpage";

const settings = useService(SettingsService);
const ui = useService(SettingsUiService);
const flows = useService(Flows);
const collection = settings.getCollection(journalConfigCollection);

const entries = computed<readonly [string, JournalConfig][]>(() =>
  Object.entries(collection.entries as Record<string, JournalConfig>).toSorted(([a], [b]) => a.localeCompare(b)),
);

function add(): void {
  void flows.invoke(AddJournalFlow);
}
function edit(journalName: string): void {
  ui.push(journalEditSubpage, { journalName });
}
function rename(journalName: string): void {
  void flows.invoke(RenameJournalFlow, { journalName });
}
function remove(journalName: string): void {
  void flows.invoke(DeleteJournalFlow, { journalName });
}
</script>

<template>
  <UiSettingRow heading>
    <template #name>{{ m.journal_dashboard_section_title() }}</template>
    <UiButton cta @click="add">{{ m.journal_dashboard_add() }}</UiButton>
  </UiSettingRow>
  <UiSettingRow v-if="entries.length === 0" no-controls>
    <template #description>{{ m.journal_dashboard_empty() }}</template>
  </UiSettingRow>
  <ul v-else class="journal-dashboard-list">
    <li v-for="[name, config] in entries" :key="name">
      <UiSettingRow>
        <template #name>
          {{ name }}
          <span class="flair">{{
            m.journal_write({ every: "day", duration: 1, ...describeWrite(config.write) })
          }}</span>
        </template>
        <UiIconButton icon="pencil" :tooltip="`${m.journal_dashboard_edit()} ${name}`" @click="edit(name)" />
        <UiIconButton
          icon="case-sensitive"
          :tooltip="`${m.journal_dashboard_rename()} ${name}`"
          @click="rename(name)"
        />
        <UiIconButton icon="trash-2" :tooltip="`${m.journal_dashboard_delete()} ${name}`" @click="remove(name)" />
      </UiSettingRow>
    </li>
  </ul>
</template>

<style scoped>
.journal-dashboard-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
</style>
