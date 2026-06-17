<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import {
  AddJournalFlow,
  DeleteJournalFlow,
  JournalsViewModel,
  journalEditSubpage,
  type JournalConfig,
} from "@/journals";
import { SettingsUiService } from "@/settings";
import { icons } from "@/ui/icons";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";

import { ShelvesViewModel } from "../view-model";

import JournalList from "./JournalList.vue";

const ui = useService(SettingsUiService);
const flows = useService(Flows);
const journalsVM = useService(JournalsViewModel);
const shelvesVM = useService(ShelvesViewModel);

const shelvedNames = computed(() => new Set(shelvesVM.shelves.value.flatMap((shelf) => shelf.journals)));
const hasShelves = computed(() => shelvesVM.shelfCount.value > 0);

const entries = computed<readonly [string, JournalConfig][]>(() =>
  journalsVM.journals.value
    .filter((index) => !shelvedNames.value.has(index.name))
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .map((index): [string, JournalConfig] => [index.name, index]),
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
      <UiIconedRow :icon="icons.entity.journal">
        {{ hasShelves ? m.shelf_journals_block_title_filtered() : m.common_label_journals() }}
        <span class="flair">{{ entries.length }}</span>
      </UiIconedRow>
    </template>
    <template #controls>
      <UiIconButton :icon="icons.action.add" cta :tooltip="m.journal_create()" @click="add" />
    </template>
    <JournalList :entries="entries" :empty-text="m.journal_dashboard_empty()" @edit="edit" @delete="remove" />
  </UiCollapsibleBlock>
</template>
