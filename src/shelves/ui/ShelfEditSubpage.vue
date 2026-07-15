<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { AddJournalFlow, DeleteJournalFlow, JournalsViewModel, journalEditSubpage } from "@/journals";
import type { JournalConfig } from "@/journals";
import { BulkAddFlow } from "@/journals/notes/bulk-add/flows/bulk-add.flow";
import type { SubpageNav } from "@/settings";
import { icons } from "@/ui/icons";
import UiBackLink from "@/ui/UiBackLink.vue";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { EditShelfNameFlow } from "../flows/edit-shelf-name.flow";
import { ShelvesService } from "../service";
import { ShelvesViewModel } from "../view-model";

import JournalList from "./JournalList.vue";
import { ShelfEditSectionToken } from "./shelf-edit-section";

const props = defineProps<{ shelfName: string; nav: SubpageNav }>();
const { shelfName } = props;
const nav: SubpageNav = props.nav;

const flows = useService(Flows);
const shelvesVM = useService(ShelvesViewModel);
const shelvesService = useService(ShelvesService);
const journalsVM = useService(JournalsViewModel);
const editSections = useService(ShelfEditSectionToken).toSorted((a, b) => a.order - b.order);

const shelf = computed(() => shelvesVM.getShelf(shelfName).getOrUndefined());

watchEffect(() => {
  if (!shelf.value) nav.back();
});

const entries = computed<readonly [string, JournalConfig][]>(() =>
  (shelf.value?.journals ?? [])
    .map((name): [string, JournalConfig] | undefined => {
      const config = journalsVM.getJournal(name).getOrUndefined();
      return config ? [name, config] : undefined;
    })
    .filter((entry): entry is [string, JournalConfig] => entry !== undefined),
);

const expanded = ref(true);

function rename(): void {
  void flows.invoke(EditShelfNameFlow, { shelfName });
}
function add(): void {
  void flows.invoke(AddJournalFlow).tap(({ name }) => {
    shelvesService.assign(name, shelfName);
  });
}
function edit(journalName: string): void {
  nav.push(journalEditSubpage, { journalName });
}
function bulkAdd(journalName: string): void {
  void flows.invoke(BulkAddFlow, { journalName });
}
function remove(journalName: string): void {
  void flows.invoke(DeleteJournalFlow, { journalName });
}
</script>

<template>
  <div v-if="shelf">
    <UiBackLink @click="nav.back()" />

    <UiSettingRow heading>
      <template #name>{{ shelf.name }}</template>
      <UiIconButton :icon="icons.action.edit" :tooltip="m.shelf_rename()" @click="rename" />
    </UiSettingRow>

    <UiCollapsibleBlock v-model:expanded="expanded">
      <template #trigger>
        <UiIconedRow :icon="icons.entity.journal">
          {{ m.common_label_journals() }}
          <span class="flair">{{ entries.length }}</span>
        </UiIconedRow>
      </template>
      <template #controls>
        <UiIconButton :icon="icons.action.add" :tooltip="m.journal_create()" @click="add" />
      </template>
      <JournalList
        :entries="entries"
        :empty-text="m.journal_dashboard_empty()"
        @bulk-add="bulkAdd"
        @edit="edit"
        @delete="remove"
      />
    </UiCollapsibleBlock>
    <component :is="section.component" v-for="section in editSections" :key="section.key" :shelf-name="shelfName" />
  </div>
</template>
