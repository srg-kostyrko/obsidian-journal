<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { useModalService } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { ToolbarItemsService } from "../blocks/toolbar/toolbar-items-service";
import { AddToolbarItemToBlockFlow } from "../flows/add-toolbar-item-to-block.flow";
import { ViewsService } from "../service";
import { ViewsViewModel } from "../view-model";

import { editToolbarItemModal } from "./modals";

import type { BlockInstanceId, ViewId } from "../config";
import type { ToolbarItemDefinition } from "../define-toolbar-item";

const props = defineProps<{ viewId: ViewId; blockId: BlockInstanceId }>();

const flows = useService(Flows);
const modals = useModalService();
const toolbarItems = useService(ToolbarItemsService);
const viewsService = useService(ViewsService);
const viewsVM = useService(ViewsViewModel);

interface Row {
  id: BlockInstanceId;
  key: string;
  config: Record<string, unknown>;
  definition: ToolbarItemDefinition | undefined;
}

const rows = computed<Row[]>(() => {
  const items = viewsVM
    .getView(props.viewId)
    .map((view) => view.blocks.find((b) => b.id === props.blockId))
    .map((block) => (block ? toolbarItems.itemsOf(block) : []))
    .getOr([]);
  return items.map((item) => ({
    id: item.id,
    key: item.key,
    config: item.config,
    definition: viewsService.getToolbarItemDefinition(item.key).getOr(undefined as never),
  }));
});

const moveUp = (id: BlockInstanceId): void => void viewsService.moveToolbarItemUp(props.viewId, props.blockId, id);
const moveDown = (id: BlockInstanceId): void => void viewsService.moveToolbarItemDown(props.viewId, props.blockId, id);
const remove = (id: BlockInstanceId): void => void viewsService.removeToolbarItem(props.viewId, props.blockId, id);
const add = (): void => void flows.invoke(AddToolbarItemToBlockFlow, { viewId: props.viewId, blockId: props.blockId });

function edit(row: Row): void {
  if (!row.definition?.configComponent) return;
  void modals
    .open(editToolbarItemModal, { component: row.definition.configComponent, config: row.config })
    .tap((next) => void viewsService.updateToolbarItemConfig(props.viewId, props.blockId, row.id, next));
}
</script>

<template>
  <UiSettingRow v-if="rows.length === 0">
    <template #description>{{ m.view_toolbar_item_empty() }}</template>
  </UiSettingRow>
  <UiSettingRow v-for="(row, index) of rows" :key="row.id">
    <template #name>
      <template v-if="row.definition">
        <UiIcon v-if="row.definition.icon" :name="row.definition.icon" />
        {{ row.definition.label }}
      </template>
      <template v-else>{{ m.view_toolbar_item_unknown_label({ key: row.key }) }}</template>
    </template>
    <UiIconButton
      icon="chevron-up"
      :tooltip="m.common_action_move_up()"
      :disabled="index === 0"
      @click="moveUp(row.id)"
    />
    <UiIconButton
      icon="chevron-down"
      :tooltip="m.common_action_move_down()"
      :disabled="index === rows.length - 1"
      @click="moveDown(row.id)"
    />
    <UiIconButton
      v-if="row.definition?.configComponent"
      icon="pencil"
      :tooltip="m.view_toolbar_item_edit()"
      @click="edit(row)"
    />
    <UiIconButton icon="trash-2" :tooltip="m.view_toolbar_item_remove()" @click="remove(row.id)" />
  </UiSettingRow>
  <UiSettingRow controls-only>
    <UiButton cta @click="add">{{ m.view_add_toolbar_item() }}</UiButton>
  </UiSettingRow>
</template>
