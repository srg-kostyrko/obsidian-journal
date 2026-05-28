<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import UiButton from "@/ui/UiButton.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { AddBlockToViewFlow } from "../flows/add-block-to-view.flow";
import { ViewsService } from "../service";
import { ViewsViewModel } from "../view-model";

import type { BlockInstanceId, ViewId } from "../config";
import type { ViewBlockDefinition } from "../define-view-block";

const props = defineProps<{ viewId: ViewId }>();

const flows = useService(Flows);
const viewsService = useService(ViewsService);
const viewsVM = useService(ViewsViewModel);

interface RowEntry {
  id: BlockInstanceId;
  key: string;
  definition: ViewBlockDefinition | undefined;
}

const rows = computed<RowEntry[]>(() => {
  const blocks =
    viewsVM
      .getView(props.viewId)
      .map((view) => view.blocks)
      .getOr(undefined as never) ?? [];
  return blocks.map((block) => ({
    id: block.id,
    key: block.key,
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
</script>

<template>
  <UiSettingRow v-if="rows.length === 0">
    <template #description>{{ m.view_edit_blocks_empty() }}</template>
  </UiSettingRow>
  <UiSettingRow v-for="(row, index) of rows" :key="row.id">
    <template #name>
      <template v-if="row.definition">
        <UiIcon v-if="row.definition.icon" :name="row.definition.icon" />
        {{ row.definition.label }}
      </template>
      <template v-else>{{ m.view_block_unknown_label({ key: row.key }) }}</template>
    </template>
    <UiIconButton icon="chevron-up" :tooltip="m.view_block_move_up()" :disabled="index === 0" @click="moveUp(row.id)" />
    <UiIconButton
      icon="chevron-down"
      :tooltip="m.view_block_move_down()"
      :disabled="index === rows.length - 1"
      @click="moveDown(row.id)"
    />
    <UiIconButton icon="trash-2" :tooltip="m.view_block_remove()" @click="remove(row.id)" />
  </UiSettingRow>

  <UiSettingRow controls-only>
    <UiButton cta @click="add">{{ m.view_edit_blocks_add() }}</UiButton>
  </UiSettingRow>
</template>
