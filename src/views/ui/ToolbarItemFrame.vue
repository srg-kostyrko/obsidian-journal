<script setup lang="ts">
import { m } from "@/i18n";
import { icons } from "@/ui/icons";
import UiIcon from "@/ui/UiIcon.vue";
import UiIconButton from "@/ui/UiIconButton.vue";

import type { BlockInstanceId } from "../config";
import type { ToolbarItemDefinition } from "../define-toolbar-item";

defineProps<{
  item: { id: BlockInstanceId; key: string; config: Record<string, unknown> };
  definition: ToolbarItemDefinition | undefined;
}>();
defineEmits<{ edit: []; remove: [] }>();
</script>

<template>
  <div class="jv-item-frame">
    <span class="jv-frame-grip" data-drag-handle><UiIcon :name="icons.action.dragHandle" /></span>
    <div class="jv-item-preview">
      <component :is="definition.component" v-if="definition" :instance-id="item.id" :config="item.config" />
      <span v-else>{{ m.view_toolbar_item_unknown_label({ key: item.key }) }}</span>
    </div>
    <span class="jv-frame-tools">
      <UiIconButton
        v-if="definition?.configComponent"
        :icon="icons.action.edit"
        :tooltip="m.view_toolbar_item_edit()"
        @click="$emit('edit')"
      />
      <UiIconButton :icon="icons.action.delete" :tooltip="m.view_toolbar_item_remove()" @click="$emit('remove')" />
    </span>
  </div>
</template>

<style scoped>
.jv-item-frame {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2-2);
  padding: var(--size-2-1) var(--size-2-2);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-m);
  background: var(--background-primary);
}
.jv-item-frame:hover {
  border-color: var(--interactive-accent);
}
.jv-frame-grip {
  display: inline-flex;
  cursor: grab;
  color: var(--text-faint);
}
.jv-item-preview {
  display: inline-flex;
  align-items: center;
  pointer-events: none;
}
.jv-frame-tools {
  display: inline-flex;
  gap: var(--size-2-1);
  opacity: 0;
}
.jv-item-frame:hover .jv-frame-tools {
  opacity: 1;
}
</style>
