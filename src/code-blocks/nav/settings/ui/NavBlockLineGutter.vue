<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { icons } from "@/ui/icons";
import UiIconButton from "@/ui/UiIconButton.vue";
import { useSortableList } from "@/views/ui/use-sortable-list";

const props = defineProps<{
  lineIndex: number;
  segmentCount: number;
  isFirst: boolean;
  isLast: boolean;
  group: string;
  lineEl: HTMLElement | null;
}>();

const emit = defineEmits<{
  moveUp: [];
  moveDown: [];
  addSegment: [];
  removeLine: [];
  reorder: [orderedIds: string[]];
  dragStart: [];
  dragEnd: [];
}>();

// A computed, not a watch keyed on segmentCount alone: this instance is reused by position
// (NavBlock's lines are keyed by index), so lineIndex can change under it independently of
// segmentCount — both must stay live inputs or the synthesized ids go stale.
const segmentsVm = computed(() =>
  Array.from({ length: props.segmentCount }, (_, segmentIndex) => ({ id: `${props.lineIndex}:${segmentIndex}` })),
);

const lineEl = computed(() => props.lineEl);
useSortableList(lineEl, segmentsVm, (orderedIds) => emit("reorder", orderedIds), {
  group: props.group,
  draggable: ".nav-row",
  onDragStart: () => emit("dragStart"),
  onDragEnd: () => emit("dragEnd"),
});
</script>

<template>
  <span class="nav-line-gutter">
    <UiIconButton
      :icon="icons.action.moveUp"
      :tooltip="m.common_action_move_up()"
      :disabled="isFirst"
      @click="emit('moveUp')"
    />
    <UiIconButton
      :icon="icons.action.moveDown"
      :tooltip="m.common_action_move_down()"
      :disabled="isLast"
      @click="emit('moveDown')"
    />
    <UiIconButton :icon="icons.action.add" :tooltip="m.block_lines_add_segment()" @click="emit('addSegment')" />
    <UiIconButton :icon="icons.action.delete" :tooltip="m.block_lines_delete_tooltip()" @click="emit('removeLine')" />
  </span>
</template>

<style scoped>
.nav-line-gutter {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2-1);
  color: var(--text-muted);
  --icon-size: var(--icon-s);
}
.nav-line-gutter :deep(.icon-button) {
  padding: var(--size-2-1) var(--size-2-2);
}
/* The move buttons stay in place on the edge lines so every line's gutter keeps the same
   columns; dimmed so an unusable one does not read as clickable. */
.nav-line-gutter :deep(.icon-button:disabled) {
  opacity: 0.5;
}
</style>
