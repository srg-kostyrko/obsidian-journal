<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import type { SubpageNav } from "@/settings";
import { ShelvesViewModel } from "@/shelves";
import { icons } from "@/ui/icons";
import UiBackLink from "@/ui/UiBackLink.vue";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiIconSuggest from "@/ui/UiIconSuggest.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { AddBlockToViewFlow } from "../flows/add-block-to-view.flow";
import { EditViewNameFlow } from "../flows/edit-view-name.flow";
import { RepositionViewFlow } from "../flows/reposition-view.flow";
import { ViewsService } from "../service";
import { ViewHostService } from "../view-host";
import { ViewsViewModel } from "../view-model";

import BlocksList from "./BlocksList.vue";

import type { View, ViewId } from "../config";

const { viewId, nav } = defineProps<{ viewId: ViewId; nav: SubpageNav }>();

const flows = useService(Flows);
const viewsService = useService(ViewsService);
const viewsVM = useService(ViewsViewModel);
const shelvesVM = useService(ShelvesViewModel);
const viewHost = useService(ViewHostService);

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

const openOnStartupValue = computed<boolean>({
  get: () => view.value?.openOnStartup ?? false,
  set: (next) => {
    void viewsService.update(viewId, { openOnStartup: next });
    if (next) void viewHost.open(viewId);
  },
});

const leafValue = computed<string>({
  get: () => view.value?.leaf ?? "right",
  set: (next) => {
    void viewsService.update(viewId, { leaf: next as View["leaf"] }).tap(() => {
      void flows.invoke(RepositionViewFlow, { viewId });
    });
  },
});

const blocksOpen = ref(true);

function rename(): void {
  void flows.invoke(EditViewNameFlow, { viewId });
}

function addBlock(): void {
  void flows.invoke(AddBlockToViewFlow, { viewId });
}
</script>

<template>
  <div v-if="view">
    <UiBackLink @click="nav.back()" />

    <UiSettingRow heading>
      <template #name>{{ view.name }}</template>
      <UiIconButton :icon="icons.action.edit" :tooltip="m.view_rename()" @click="rename" />
    </UiSettingRow>

    <UiSettingRow :name="m.common_label_icon()">
      <template #description>{{ m.view_edit_icon_description() }}</template>
      <UiIconSuggest v-model="iconValue" />
    </UiSettingRow>

    <UiSettingRow :name="m.view_edit_default_shelf_label()">
      <template #description>{{ m.view_edit_default_shelf_description() }}</template>
      <UiDropdown v-model="shelfValue">
        <option value="">{{ m.common_label_all_journals() }}</option>
        <option v-for="opt of shelvesVM.shelfOptions.value" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow :name="m.common_show_in_ribbon()">
      <template #description>{{ m.view_edit_show_in_ribbon_description() }}</template>
      <UiToggle v-model="ribbonValue" />
    </UiSettingRow>

    <UiSettingRow :name="m.view_edit_open_on_startup_label()">
      <template #description>{{ m.view_edit_open_on_startup_description() }}</template>
      <UiToggle v-model="openOnStartupValue" />
    </UiSettingRow>

    <UiSettingRow :name="m.view_edit_leaf_label()">
      <template #description>{{ m.view_edit_leaf_description() }}</template>
      <UiDropdown v-model="leafValue">
        <option value="left">{{ m.view_edit_leaf_left() }}</option>
        <option value="right">{{ m.view_edit_leaf_right() }}</option>
        <option value="tab">{{ m.view_edit_leaf_tab() }}</option>
      </UiDropdown>
    </UiSettingRow>

    <UiCollapsibleBlock v-model:expanded="blocksOpen">
      <template #trigger>
        <UiIconedRow :icon="icons.entity.view">
          {{ m.view_edit_blocks_title() }}
          <span class="flair">{{ view.blocks.length }}</span>
        </UiIconedRow>
      </template>
      <template #controls>
        <UiIconButton :icon="icons.action.add" :tooltip="m.view_add_block()" @click="addBlock" />
      </template>
      <BlocksList :view-id="viewId" />
    </UiCollapsibleBlock>
  </div>
</template>
