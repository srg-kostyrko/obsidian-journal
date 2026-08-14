<script setup lang="ts">
import { m } from "@/i18n";
import { icons } from "@/ui/icons";
import UiIcon from "@/ui/UiIcon.vue";
import UiIconButton from "@/ui/UiIconButton.vue";

defineProps<{ icon?: string; label: string; summary?: string; editable: boolean }>();
defineEmits<{ edit: []; remove: [] }>();
</script>

<template>
  <div class="jv-block-frame">
    <span class="jv-frame-grip" data-drag-handle><UiIcon :name="icons.action.dragHandle" /></span>
    <UiIcon v-if="icon" :name="icon" class="jv-block-icon" />
    <span class="jv-block-label">{{ label }}</span>
    <span v-if="summary" class="jv-block-summary">{{ summary }}</span>
    <span class="jv-frame-spacer" />
    <span class="jv-frame-tools">
      <UiIconButton
        v-if="editable"
        :icon="icons.action.configure"
        :tooltip="m.view_block_edit()"
        @click="$emit('edit')"
      />
      <UiIconButton :icon="icons.action.delete" :tooltip="m.view_block_remove()" @click="$emit('remove')" />
    </span>
  </div>
</template>

<style scoped>
.jv-block-frame {
  display: flex;
  align-items: center;
  gap: var(--size-2-2);
  padding: var(--size-2-2) var(--size-4-1);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-m);
  background: var(--background-secondary);
}
.jv-block-frame:hover {
  border-color: var(--interactive-accent);
}
.jv-frame-grip {
  display: inline-flex;
  cursor: grab;
  color: var(--text-faint);
}
.jv-block-icon {
  color: var(--text-muted);
}
.jv-block-label {
  font-weight: var(--font-semibold);
}
.jv-block-summary {
  color: var(--text-muted);
  font-size: var(--font-ui-smaller);
}
.jv-frame-spacer {
  flex: 1;
}
.jv-frame-tools {
  display: inline-flex;
  gap: var(--size-2-1);
}
</style>
