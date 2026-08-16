<script setup lang="ts">
import { ref } from "vue";

import { useSortableList } from "@/views/ui/use-sortable-list";

// A drop target for splitting a new line off at this position — never holds real segments of
// its own, so its view-model list stays permanently empty; a drop is reported and the physically
// moved node is handed back to useSortableList to undo, same as any other cross-container drop.
const props = defineProps<{ targetLine: number; showing: boolean; group: string }>();

const emit = defineEmits<{ drop: [orderedIds: string[]] }>();

const zoneEl = ref<HTMLElement | null>(null);
const empty = ref<{ id: string }[]>([]);

useSortableList(zoneEl, empty, (orderedIds) => emit("drop", orderedIds), {
  group: props.group,
  draggable: ".nav-row",
  // The strip is deliberately thin so it costs no layout, so lean on SortableJS's own
  // out-of-box forgiveness rather than growing the box to catch the pointer.
  emptyInsertThreshold: 16,
});
</script>

<template>
  <div
    ref="zoneEl"
    class="nav-line-drop"
    :class="{ 'nav-line-drop--showing': showing }"
    :data-line-index="targetLine"
  />
</template>

<style scoped>
/* Always in layout, never toggled with v-show. Revealing N+1 of these at drag start used to
   add their full height between every line at once, so the list lurched downward the instant
   the pointer moved and the segment left the cursor. Only paint changes now: the box, and the
   transparent border reserving the indicator's own 2px, are there the whole time. */
.nav-line-drop {
  height: var(--size-2-2);
  border-top: 2px dashed transparent;
  transition: opacity 120ms ease-out;
  opacity: 0;
}
.nav-line-drop--showing {
  border-top-color: var(--color-accent);
  opacity: 0.6;
}
</style>
