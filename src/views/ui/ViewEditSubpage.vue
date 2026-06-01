<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import type { SubpageNav } from "@/settings";
import { ShelvesViewModel } from "@/shelves";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiIconSuggest from "@/ui/UiIconSuggest.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { EditViewNameFlow } from "../flows/edit-view-name.flow";
import { ViewsService } from "../service";
import { ViewsViewModel } from "../view-model";

import BlocksList from "./BlocksList.vue";

import type { ViewId } from "../config";

const { viewId, nav } = defineProps<{ viewId: ViewId; nav: SubpageNav }>();

const flows = useService(Flows);
const viewsService = useService(ViewsService);
const viewsVM = useService(ViewsViewModel);
const shelvesVM = useService(ShelvesViewModel);

const view = computed(() => viewsVM.getView(viewId).getOr(undefined as never));

watchEffect(() => {
  if (!view.value) nav.back();
});

const iconValue = computed<string>({
  get: () => view.value?.icon ?? "",
  set: (next) => {
    void viewsService.update(viewId, { icon: next });
  },
});

const shelfValue = computed<string>({
  get: () => view.value?.defaultShelf ?? "",
  set: (next) => {
    void viewsService.update(viewId, { defaultShelf: next === "" ? null : next });
  },
});

const ribbonValue = computed<boolean>({
  get: () => view.value?.showInRibbon ?? false,
  set: (next) => {
    void viewsService.update(viewId, { showInRibbon: next });
  },
});

const leafValue = computed<string>({
  get: () => view.value?.leaf ?? "right",
  set: (next) => {
    void viewsService.update(viewId, { leaf: next as "left" | "right" | "tab" });
  },
});

const blocksOpen = ref(true);

function rename(): void {
  void flows.invoke(EditViewNameFlow, { viewId });
}
</script>

<template>
  <div v-if="view">
    <UiSettingRow heading>
      <template #name>{{ m.view_edit_header_title({ name: view.name }) }}</template>
      <UiIconButton icon="pencil" :tooltip="m.view_edit_rename_tooltip()" @click="rename" />
      <UiIconButton icon="chevron-left" :tooltip="m.journal_edit_back_tooltip()" @click="nav.back()" />
    </UiSettingRow>

    <UiSettingRow :name="m.view_edit_icon_label()">
      <UiIconSuggest v-model="iconValue" />
    </UiSettingRow>

    <UiSettingRow :name="m.view_edit_default_shelf_label()">
      <UiDropdown v-model="shelfValue">
        <option value="">{{ m.view_edit_default_shelf_all() }}</option>
        <option v-for="opt of shelvesVM.shelfOptions.value" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow :name="m.view_edit_show_in_ribbon_label()">
      <UiToggle v-model="ribbonValue" />
    </UiSettingRow>

    <UiSettingRow :name="m.view_edit_leaf_label()">
      <UiDropdown v-model="leafValue">
        <option value="left">{{ m.view_edit_leaf_left() }}</option>
        <option value="right">{{ m.view_edit_leaf_right() }}</option>
        <option value="tab">{{ m.view_edit_leaf_tab() }}</option>
      </UiDropdown>
    </UiSettingRow>

    <UiCollapsibleBlock v-model:expanded="blocksOpen">
      <template #trigger>
        <UiIconedRow icon="layout-dashboard">
          {{ m.view_edit_blocks_title() }}
          <span class="flair">{{ view.blocks.length }}</span>
        </UiIconedRow>
      </template>
      <BlocksList :view-id="viewId" />
    </UiCollapsibleBlock>
  </div>
</template>
