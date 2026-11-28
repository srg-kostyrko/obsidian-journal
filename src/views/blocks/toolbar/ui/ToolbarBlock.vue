<script setup lang="ts">
import { computed } from "vue";

import { useService } from "@/infrastructure/di";

import { spacerItem } from "../../../toolbar-items/spacer/spacer-item";
import { ToolbarItemsService } from "../toolbar-items-service";

import type { BlockInstanceId } from "../../../config";

interface ItemInstance {
  id: BlockInstanceId;
  key: string;
  config: Record<string, unknown>;
}

const props = defineProps<{
  instanceId: BlockInstanceId;
  config: { items: ItemInstance[] };
}>();

const toolbarItems = useService(ToolbarItemsService);

type ResolvedItem = ReturnType<ToolbarItemsService["resolveItems"]>[number];
type Entry =
  | { kind: "spacer"; id: string; item: ResolvedItem }
  | { kind: "group"; id: string; items: ResolvedItem[]; afterSpacer: boolean };

const entries = computed(() => {
  const result: Entry[] = [];
  let group: Extract<Entry, { kind: "group" }> | null = null;
  let afterSpacer = false;
  for (const item of toolbarItems.resolveItems(props.config.items)) {
    if (item.definition.key === spacerItem.key) {
      result.push({ kind: "spacer", id: item.id, item });
      group = null;
      afterSpacer = true;
      continue;
    }
    if (group === null) {
      group = { kind: "group", id: item.id, items: [], afterSpacer };
      result.push(group);
    }
    group.items.push(item);
  }
  return result;
});
</script>

<template>
  <div class="journal-view-toolbar">
    <template v-for="entry of entries" :key="entry.id">
      <component
        :is="entry.item.definition.component"
        v-if="entry.kind === 'spacer'"
        :instance-id="entry.item.id"
        :config="entry.item.config"
      />
      <div v-else class="jv-toolbar-group" :class="{ 'is-after-spacer': entry.afterSpacer }">
        <component
          :is="item.definition.component"
          v-for="item of entry.items"
          :key="item.id"
          :instance-id="item.id"
          :config="item.config"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.journal-view-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--size-2-2);
  padding-bottom: var(--size-2-2);
}
.jv-toolbar-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--size-2-2);
  min-width: 0;
}
/* On a row shared with the spacer this resolves to nothing, because the spacer's flex-grow takes
   the free space first. It only moves a group that wrapped away from its spacer. */
.jv-toolbar-group.is-after-spacer {
  margin-inline-start: auto;
}
/* Phones keep the full padding: the button is the tap target. */
body:not(.is-phone) .journal-view-toolbar :deep(.jv-toolbar-icon-only) {
  padding-inline: 3px;
}
</style>
