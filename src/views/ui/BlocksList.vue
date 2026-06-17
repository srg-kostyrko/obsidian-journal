<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { useModalService } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";

import { AddBlockToViewFlow } from "../flows/add-block-to-view.flow";
import { ViewsService } from "../service";
import { ViewsViewModel } from "../view-model";

import BlockFrame from "./BlockFrame.vue";
import { editBlockModal } from "./modals";
import { provideViewPreviewContext } from "./preview-view-context";
import ToolbarStrip from "./ToolbarStrip.vue";
import { useSortableList } from "./use-sortable-list";

import type { BlockInstanceId, ViewId } from "../config";
import type { ViewBlockDefinition } from "../define-view-block";

const props = defineProps<{ viewId: ViewId }>();

provideViewPreviewContext(props.viewId);

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

const source = computed<RowEntry[]>(() => {
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

const rows = ref<RowEntry[]>([]);
watch(source, (next) => (rows.value = [...next]), { immediate: true, deep: true });

const listEl = ref<HTMLElement | null>(null);
useSortableList(listEl, rows, (orderedIds) => {
  void viewsService.setBlockOrder(props.viewId, orderedIds as BlockInstanceId[]);
});

function labelOf(row: RowEntry): string {
  return row.definition ? row.definition.label : m.view_block_unknown_label({ key: row.key });
}

function summaryOf(row: RowEntry): string | undefined {
  if (row.key === "toolbar") {
    const items = (row.config.items as unknown[] | undefined) ?? [];
    return m.view_block_toolbar_item_count({ count: items.length });
  }
  return row.definition?.summary?.(row.config);
}

const add = (): void => void flows.invoke(AddBlockToViewFlow, { viewId: props.viewId });
const remove = (id: BlockInstanceId): void => void viewsService.removeBlock(props.viewId, id);

function edit(row: RowEntry): void {
  if (!row.definition?.configComponent) return;
  void modals
    .open(editBlockModal, { component: row.definition.configComponent, config: row.config })
    .tap((next) => void viewsService.updateBlockConfig(props.viewId, row.id, next));
}
</script>

<template>
  <div v-if="rows.length === 0" class="jv-blocks-empty">{{ m.view_edit_blocks_empty() }}</div>
  <div ref="listEl" class="jv-blocks-list">
    <div v-for="row of rows" :key="row.id" class="jv-block-entry">
      <BlockFrame
        :icon="row.definition?.icon"
        :label="labelOf(row)"
        :summary="summaryOf(row)"
        :editable="!!row.definition?.configComponent"
        @edit="edit(row)"
        @remove="remove(row.id)"
      />
      <ToolbarStrip v-if="row.key === 'toolbar'" :view-id="props.viewId" :block-id="row.id" />
    </div>
  </div>
  <UiButton cta @click="add">{{ m.view_add_block() }}</UiButton>
</template>

<style scoped>
.jv-blocks-list {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-3);
  margin-bottom: var(--size-4-2);
}
.jv-block-entry {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-2);
}
.jv-blocks-empty {
  color: var(--text-muted);
  margin-bottom: var(--size-4-2);
}
</style>
