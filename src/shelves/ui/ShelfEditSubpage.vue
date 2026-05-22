<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";

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
import { SettingsService, type SubpageNav } from "@/settings";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { shelvesCollection } from "../config";
import { ShelvesLifecycleService } from "../lifecycle";

import { EditShelfNameFlow } from "./edit-shelf-name.flow";
import JournalList from "./JournalList.vue";
import { ShelfEditSectionToken } from "./shelf-edit-section";

const props = defineProps<{ shelfName: string; nav: SubpageNav }>();
const { shelfName } = props;
const nav: SubpageNav = props.nav;

const settings = useService(SettingsService);
const flows = useService(Flows);
const shelvesLifecycle = useService(ShelvesLifecycleService);
const shelves = settings.getCollection(shelvesCollection);
const journals = settings.getCollection(journalConfigCollection);
const editSections = useService(ShelfEditSectionToken).toSorted((a, b) => a.order - b.order);

const shelf = computed(() => shelves.get(shelfName));

watchEffect(() => {
  if (!shelf.value) nav.back();
});

const entries = computed<readonly [string, JournalConfig][]>(() =>
  (shelf.value?.journals ?? [])
    .map((name): [string, JournalConfig] | undefined => {
      const config = journals.get(name) as JournalConfig | undefined;
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
    shelvesLifecycle.assign(name, shelfName);
  });
}
function edit(journalName: string): void {
  nav.push(journalEditSubpage, { journalName });
}
function remove(journalName: string): void {
  void flows.invoke(DeleteJournalFlow, { journalName });
}
</script>

<template>
  <div v-if="shelf">
    <UiSettingRow heading>
      <template #name>{{ m.shelf_edit_header_title({ name: shelf.name }) }}</template>
      <UiIconButton icon="pencil" :tooltip="m.shelf_edit_rename_tooltip()" @click="rename" />
      <UiIconButton icon="chevron-left" :tooltip="m.journal_edit_back_tooltip()" @click="nav.back()" />
    </UiSettingRow>

    <UiCollapsibleBlock v-model:expanded="expanded">
      <template #trigger>
        <UiIconedRow icon="book-open">
          {{ m.shelf_edit_journals_title() }}
          <span class="flair">{{ entries.length }}</span>
        </UiIconedRow>
      </template>
      <template #controls>
        <UiIconButton icon="plus" cta :tooltip="m.shelf_edit_journals_add()" @click="add" />
      </template>
      <JournalList :entries="entries" :empty-text="m.journal_dashboard_empty()" @edit="edit" @delete="remove" />
    </UiCollapsibleBlock>
    <component :is="section.component" v-for="section in editSections" :key="section.key" :shelf-name="shelfName" />
  </div>
</template>
