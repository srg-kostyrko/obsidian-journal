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
  // Forgiveness has to stay well under the distance to the next zone, which is only one line's
  // height: expand it much and a zone's catch area reaches across the line between them, so the
  // pointer sits inside two competing targets at once and SortableJS flips between them on
  // every move. Just enough to catch a thin strip, not enough to reach the line.
  emptyInsertThreshold: 6,
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
/* Every split point, faint: where a new line *could* be made. */
.nav-line-drop--showing {
  border-top-color: var(--text-faint);
  opacity: 0.5;
}
/* The one that will actually take the drop. SortableJS parks the dragged segment inside the
   container it would drop into, so a non-empty zone is exactly the armed one — no guessing
   from coordinates. Paint only: growing the strip here would shift everything below it and
   push the pointer back across the boundary it just crossed. */
.nav-line-drop--showing:not(:empty) {
  border-top-style: solid;
  border-top-color: var(--interactive-accent);
  box-shadow: 0 -2px 0 0 var(--interactive-accent);
  opacity: 1;
}
/* The parked segment is a full-height row inside a strip a few pixels tall — it would paint
   over the lines either side. The accent bar above is the insertion preview instead. */
.nav-line-drop > * {
  display: none;
}
</style>
