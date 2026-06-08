<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { SettingsUiService } from "@/settings";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { DeleteShelfFlow } from "../flows/delete-shelf.flow";
import { EditShelfNameFlow } from "../flows/edit-shelf-name.flow";
import { ShelvesViewModel } from "../view-model";

import { shelfEditSubpage } from "./shelf-edit-subpage";

import type { ShelfConfig } from "../config";

const ui = useService(SettingsUiService);
const flows = useService(Flows);
const shelvesVM = useService(ShelvesViewModel);

const entries = computed<readonly [string, ShelfConfig][]>(() =>
  [...shelvesVM.shelves.value]
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .map((shelf): [string, ShelfConfig] => [shelf.name, shelf]),
);

const expanded = ref(true);

function add(): void {
  void flows.invoke(EditShelfNameFlow, {}).tap(({ shelfName }) => {
    ui.push(shelfEditSubpage, { shelfName });
  });
}
function open(shelfName: string): void {
  ui.push(shelfEditSubpage, { shelfName });
}
function remove(shelfName: string): void {
  void flows.invoke(DeleteShelfFlow, { shelfName });
}
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded">
    <template #trigger>
      <UiIconedRow icon="library">
        {{ m.shelf_dashboard_section_title() }}
        <span class="flair">{{ entries.length }}</span>
      </UiIconedRow>
    </template>
    <template #controls>
      <UiIconButton icon="plus" cta :tooltip="m.shelf_add()" @click="add" />
    </template>
    <UiSettingRow v-if="entries.length === 0">
      <template #description>{{ m.shelf_dashboard_empty() }}</template>
    </UiSettingRow>
    <template v-else>
      <UiSettingRow v-for="[name, shelf] in entries" :key="name">
        <template #name>
          {{ name }}
          <span class="flair">{{ m.shelf_member_count({ count: shelf.journals.length }) }}</span>
        </template>
        <UiIconButton icon="library" :tooltip="m.shelf_dashboard_open({ name })" @click="open(name)" />
        <UiIconButton icon="trash-2" :tooltip="m.common_delete_name({ name })" @click="remove(name)" />
      </UiSettingRow>
    </template>
  </UiCollapsibleBlock>
</template>
