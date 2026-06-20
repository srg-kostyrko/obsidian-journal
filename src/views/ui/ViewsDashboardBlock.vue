<script setup lang="ts">
import { ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { SettingsUiService } from "@/settings";
import { icons } from "@/ui/icons";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { DeleteViewFlow } from "../flows/delete-view.flow";
import { EditViewNameFlow } from "../flows/edit-view-name.flow";
import { ViewsService } from "../service";
import { ViewsViewModel } from "../view-model";

import { viewEditSubpage } from "./view-edit-subpage";

import type { ViewId } from "../config";

const ui = useService(SettingsUiService);
const flows = useService(Flows);
const viewsService = useService(ViewsService);
const viewsVM = useService(ViewsViewModel);

const expanded = ref(false);

function add(): void {
  void flows.invoke(EditViewNameFlow, {}).tap(({ viewId }) => {
    ui.push(viewEditSubpage, { viewId });
  });
}
function open(viewId: ViewId): void {
  ui.push(viewEditSubpage, { viewId });
}
function clone(viewId: ViewId): void {
  void viewsService.clone(viewId);
}
function remove(viewId: ViewId): void {
  void flows.invoke(DeleteViewFlow, { viewId });
}
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded">
    <template #trigger>
      <UiIconedRow :icon="icons.entity.view">
        {{ m.view_dashboard_section_title() }}
        <span class="flair">{{ viewsVM.viewCount.value }}</span>
      </UiIconedRow>
    </template>
    <template #controls>
      <UiIconButton :icon="icons.action.add" :tooltip="m.view_dashboard_add()" @click="add" />
    </template>
    <UiSettingRow v-if="viewsVM.views.value.length === 0">
      <template #description>{{ m.view_dashboard_empty() }}</template>
    </UiSettingRow>
    <template v-else>
      <UiSettingRow v-for="view of viewsVM.views.value" :key="view.id">
        <template #name>{{ view.name }}</template>
        <UiIconButton
          :icon="icons.action.openExternal"
          :tooltip="m.view_dashboard_open({ name: view.name })"
          @click="open(view.id)"
        />
        <UiIconButton
          :icon="icons.action.copy"
          :tooltip="m.view_dashboard_clone({ name: view.name })"
          @click="clone(view.id)"
        />
        <UiIconButton
          :icon="icons.action.delete"
          :tooltip="m.common_delete_name({ name: view.name })"
          @click="remove(view.id)"
        />
      </UiSettingRow>
    </template>
  </UiCollapsibleBlock>
</template>
