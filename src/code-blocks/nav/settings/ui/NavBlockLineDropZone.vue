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

useSortableList(zoneEl, empty, (orderedIds) => emit("drop", orderedIds), { group: props.group });
</script>

<template>
  <div v-show="showing" ref="zoneEl" class="nav-line-drop" :data-line-index="targetLine" />
</template>

<style scoped>
.nav-line-drop {
  height: var(--size-4-2);
  border-top: 2px dashed var(--color-accent);
  opacity: 0.6;
}
</style>
