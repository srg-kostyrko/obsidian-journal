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

import { AddBlockToViewFlow } from "../flows/add-block-to-view.flow";
import { ViewsService } from "../service";
import { ViewsViewModel } from "../view-model";

import { editBlockModal } from "./modals";
import ToolbarItemsList from "./ToolbarItemsList.vue";

import type { BlockInstanceId, ViewId } from "../config";
import type { ViewBlockDefinition } from "../define-view-block";

const props = defineProps<{ viewId: ViewId }>();

const flows = useService(Flows);
const modals = useModalService();
const viewsService = useService(ViewsService);
const viewsVM = useService(ViewsViewModel);

interface RowEntry {
  id: BlockInstanceId;
  key: string;
  config: Record<string, unknown>;
  definition: ViewBlockDefinition | undefined;
}

const rows = computed<RowEntry[]>(() => {
  const blocks = viewsVM
    .getView(props.viewId)
    .map((view) => view.blocks)
    .getOr([]);
  return blocks.map((block) => ({
    id: block.id,
    key: block.key,
    config: block.config,
    definition: viewsService.getBlockDefinition(block.key).getOr(undefined as never),
  }));
});

function moveUp(id: BlockInstanceId): void {
  void viewsService.moveBlockUp(props.viewId, id);
}
function moveDown(id: BlockInstanceId): void {
  void viewsService.moveBlockDown(props.viewId, id);
}
function remove(id: BlockInstanceId): void {
  void viewsService.removeBlock(props.viewId, id);
}
function add(): void {
  void flows.invoke(AddBlockToViewFlow, { viewId: props.viewId });
}
function edit(row: RowEntry): void {
  if (!row.definition?.configComponent) return;
  void modals
    .open(editBlockModal, { component: row.definition.configComponent, config: row.config })
    .tap((next) => void viewsService.updateBlockConfig(props.viewId, row.id, next));
}
</script>

<template>
  <UiSettingRow v-if="rows.length === 0">
    <template #description>{{ m.view_edit_blocks_empty() }}</template>
  </UiSettingRow>
  <template v-for="(row, index) of rows" :key="row.id">
    <UiSettingRow>
      <template #name>
        <template v-if="row.definition">
          <UiIcon v-if="row.definition.icon" :name="row.definition.icon" />
          {{ row.definition.label }}
        </template>
        <template v-else>{{ m.view_block_unknown_label({ key: row.key }) }}</template>
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
        :tooltip="m.view_block_edit()"
        @click="edit(row)"
      />
      <UiIconButton icon="trash-2" :tooltip="m.view_block_remove()" @click="remove(row.id)" />
    </UiSettingRow>
    <ToolbarItemsList v-if="row.key === 'toolbar'" :view-id="props.viewId" :block-id="row.id" />
  </template>

  <UiSettingRow controls-only>
    <UiButton cta @click="add">{{ m.view_add_block() }}</UiButton>
  </UiSettingRow>
</template>
