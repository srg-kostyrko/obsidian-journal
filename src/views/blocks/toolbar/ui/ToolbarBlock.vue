<script setup lang="ts">
import { computed } from "vue";

import { useService } from "@/infrastructure/di";

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

const resolved = computed(() => toolbarItems.resolveItems(props.config.items));
</script>

<template>
  <div class="journal-view-toolbar">
    <component
      :is="item.definition.component"
      v-for="item of resolved"
      :key="item.id"
      :instance-id="item.id"
      :config="item.config"
    />
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
</style>
