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
  dragging?: boolean;
}>();
defineEmits<{ edit: []; remove: [] }>();
</script>

<template>
  <div class="jv-item-frame" :class="{ 'is-dragging': dragging }">
    <span class="jv-frame-grip" data-drag-handle><UiIcon :name="icons.action.dragHandle" /></span>
    <div class="jv-item-preview">
      <component :is="definition.component" v-if="definition" :instance-id="item.id" :config="item.config" />
      <span v-else>{{ m.view_toolbar_item_unknown_label({ key: item.key }) }}</span>
    </div>
    <span class="jv-frame-tools">
      <UiIconButton
        v-if="definition?.configComponent"
        :icon="icons.action.configure"
        :tooltip="m.view_toolbar_item_edit()"
        @click="$emit('edit')"
      />
      <UiIconButton :icon="icons.action.delete" :tooltip="m.view_toolbar_item_remove()" @click="$emit('remove')" />
    </span>
  </div>
</template>

<style scoped>
.jv-item-frame {
  position: relative;
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
  /* Raise above siblings so the tools floating on top are not painted over by neighbouring items. */
  z-index: 1;
}
/* Suppress all hover affordances while a drag is in progress. */
.jv-item-frame.is-dragging:hover {
  border-color: var(--background-modifier-border);
  z-index: auto;
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
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: var(--size-2-2);
  display: inline-flex;
  gap: var(--size-2-1);
  padding: var(--size-2-1);
  border: 1px solid var(--interactive-accent);
  border-radius: var(--radius-m);
  background: var(--background-primary-alt);
  box-shadow: var(--shadow-l);
  opacity: 0;
  /* Hidden tools must not intercept hover/clicks meant for neighbours (e.g. the add button). */
  pointer-events: none;
}
/* Transparent bridge spanning the gap to the frame so the pointer can cross onto the tools without
   leaving the hover region. As a child it shares the tools' pointer-events, so it blocks nothing
   while hidden. */
.jv-frame-tools::before {
  content: "";
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  height: var(--size-2-2);
}
.jv-item-frame:hover .jv-frame-tools {
  opacity: 1;
  pointer-events: auto;
}
/* While a drag is in progress no frame should reveal its tools on hover — the dragged item
   passing over a neighbour would otherwise pop that neighbour's controls. */
.jv-item-frame.is-dragging:hover .jv-frame-tools {
  opacity: 0;
  pointer-events: none;
}
</style>
