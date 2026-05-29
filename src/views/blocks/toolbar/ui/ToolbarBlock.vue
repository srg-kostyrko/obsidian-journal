<script setup lang="ts">
import * as v from "valibot";
import { computed } from "vue";

import { useService } from "@/infrastructure/di";
import { LoggerFactoryToken } from "@/infrastructure/logger";

import { ToolbarItemDefinitionToken } from "../../../tokens";

import type { BlockInstanceId } from "../../../config";
import type { ToolbarItemDefinition } from "../../../define-toolbar-item";

interface ItemInstance {
  id: BlockInstanceId;
  key: string;
  config: Record<string, unknown>;
}

const props = defineProps<{
  instanceId: BlockInstanceId;
  config: { items: ItemInstance[] };
}>();

const definitions = useService(ToolbarItemDefinitionToken);
const logger = useService(LoggerFactoryToken).named("toolbar-block");

const byKey = computed<ReadonlyMap<string, ToolbarItemDefinition>>(() => {
  const map = new Map<string, ToolbarItemDefinition>();
  for (const d of definitions) map.set(d.key, d);
  return map;
});

interface ResolvedItem {
  readonly id: BlockInstanceId;
  readonly definition: ToolbarItemDefinition;
  readonly config: unknown;
}

const resolved = computed<readonly ResolvedItem[]>(() => {
  const out: ResolvedItem[] = [];
  for (const item of props.config.items) {
    const definition = byKey.value.get(item.key);
    if (!definition) {
      logger.warn("unknown toolbar item key", { key: item.key, instanceId: props.instanceId });
      continue;
    }
    const parsed = v.safeParse(definition.schema, item.config);
    if (!parsed.success) {
      logger.warn("invalid toolbar item config", { key: item.key, itemId: item.id });
      continue;
    }
    out.push({ id: item.id, definition, config: parsed.output });
  }
  return out;
});
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
