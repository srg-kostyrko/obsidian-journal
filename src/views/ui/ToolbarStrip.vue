<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { useModalService } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";

import { ToolbarItemsService } from "../blocks/toolbar/toolbar-items-service";
import { AddToolbarItemToBlockFlow } from "../flows/add-toolbar-item-to-block.flow";
import { ViewsService } from "../service";
import { ViewsViewModel } from "../view-model";

import { editToolbarItemModal } from "./modals";
import ToolbarItemFrame from "./ToolbarItemFrame.vue";
import { useSortableList } from "./use-sortable-list";

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

const source = computed<Row[]>(() => {
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

const rows = ref<Row[]>([]);
watch(source, (next) => (rows.value = [...next]), { immediate: true, deep: true });

const stripEl = ref<HTMLElement | null>(null);
useSortableList(stripEl, rows, (orderedIds) => {
  void viewsService.setToolbarItemOrder(props.viewId, props.blockId, orderedIds as BlockInstanceId[]);
});

const add = (): void => void flows.invoke(AddToolbarItemToBlockFlow, { viewId: props.viewId, blockId: props.blockId });
const remove = (id: BlockInstanceId): void => void viewsService.removeToolbarItem(props.viewId, props.blockId, id);

function edit(row: Row): void {
  if (!row.definition?.configComponent) return;
  void modals
    .open(editToolbarItemModal, { component: row.definition.configComponent, config: row.config })
    .tap((next) => void viewsService.updateToolbarItemConfig(props.viewId, props.blockId, row.id, next));
}
</script>

<template>
  <div class="jv-toolbar-strip">
    <div v-if="rows.length === 0" class="jv-strip-empty">{{ m.view_toolbar_item_empty() }}</div>
    <div ref="stripEl" class="jv-strip-items">
      <ToolbarItemFrame
        v-for="row of rows"
        :key="row.id"
        :item="row"
        :definition="row.definition"
        @edit="edit(row)"
        @remove="remove(row.id)"
      />
    </div>
    <UiButton @click="add">{{ m.view_add_toolbar_item() }}</UiButton>
  </div>
</template>

<style scoped>
.jv-toolbar-strip {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-2);
  padding-left: var(--size-4-4);
}
.jv-strip-items {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--size-2-2);
}
.jv-strip-empty {
  color: var(--text-muted);
}
</style>
