<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import {
  AddJournalFlow,
  DeleteJournalFlow,
  journalConfigCollection,
  journalEditSubpage,
  type JournalConfig,
} from "@/journals";
import { SettingsService, SettingsUiService } from "@/settings";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";

import { shelvesCollection } from "../config";

import JournalList from "./JournalList.vue";

const settings = useService(SettingsService);
const ui = useService(SettingsUiService);
const flows = useService(Flows);
const journals = settings.getCollection(journalConfigCollection);
const shelves = settings.getCollection(shelvesCollection);

const shelvedNames = computed(() => new Set(Object.values(shelves.entries).flatMap((shelf) => shelf.journals)));
const hasShelves = computed(() => Object.keys(shelves.entries).length > 0);

const entries = computed<readonly [string, JournalConfig][]>(() =>
  (Object.entries(journals.entries) as [string, JournalConfig][])
    .filter(([name]) => !shelvedNames.value.has(name))
    .toSorted(([a], [b]) => a.localeCompare(b)),
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
        {{ hasShelves ? m.shelf_journals_block_title_filtered() : m.shelf_journals_block_title() }}
        <span class="flair">{{ entries.length }}</span>
      </UiIconedRow>
    </template>
    <template #controls>
      <UiIconButton icon="plus" cta :tooltip="m.journal_dashboard_add()" @click="add" />
    </template>
    <JournalList :entries="entries" :empty-text="m.journal_dashboard_empty()" @edit="edit" @delete="remove" />
  </UiCollapsibleBlock>
</template>
