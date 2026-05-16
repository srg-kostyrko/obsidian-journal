<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { journalConfigCollection, type JournalConfig } from "@/journals";
import { SettingsService, SettingsUiService } from "@/settings";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { describeWrite } from "../describe-write";
import { AddJournalFlow } from "../flows/add-journal.flow";
import { DeleteJournalFlow } from "../flows/delete-journal.flow";

import { journalEditSubpage } from "./journals-subpage";

const settings = useService(SettingsService);
const ui = useService(SettingsUiService);
const flows = useService(Flows);
const collection = settings.getCollection(journalConfigCollection);

const entries = computed<readonly [string, JournalConfig][]>(() =>
  Object.entries(collection.entries as Record<string, JournalConfig>).toSorted(([a], [b]) => a.localeCompare(b)),
);

const expanded = ref(true);

function add(): void {
  void flows.invoke(AddJournalFlow);
}
function edit(journalName: string): void {
  ui.push(journalEditSubpage, { journalName });
}
function remove(journalName: string): void {
  void flows.invoke(DeleteJournalFlow, { journalName });
}
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded">
    <template #trigger>
      <UiIconedRow icon="book-open">
        {{ m.journal_dashboard_section_title() }}
        <span class="flair">{{ entries.length }}</span>
      </UiIconedRow>
    </template>
    <template #controls>
      <UiIconButton icon="plus" cta :tooltip="m.journal_dashboard_add()" @click="add" />
    </template>
    <UiSettingRow v-if="entries.length === 0">
      <template #description>{{ m.journal_dashboard_empty() }}</template>
    </UiSettingRow>
    <template v-else>
      <UiSettingRow v-for="[name, config] in entries" :key="name">
        <template #name>
          {{ name }}
          <span class="flair">{{
            m.journal_write({ every: "day", duration: 1, ...describeWrite(config.write) })
          }}</span>
        </template>
        <UiIconButton icon="pencil" :tooltip="`${m.journal_dashboard_edit()} ${name}`" @click="edit(name)" />
        <UiIconButton icon="trash-2" :tooltip="`${m.journal_dashboard_delete()} ${name}`" @click="remove(name)" />
      </UiSettingRow>
    </template>
  </UiCollapsibleBlock>
</template>
