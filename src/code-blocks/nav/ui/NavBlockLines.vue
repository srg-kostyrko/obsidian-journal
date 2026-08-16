<script setup lang="ts">
import { ref } from "vue";

import type { AnchorString } from "@/calendar";
import type { JournalConfig, JournalNavBlock } from "@/journals";

import NavBlockSegment from "./NavBlockSegment.vue";

// Split out of NavBlock.vue so the line/segment loop exists once: NavBlock renders this
// component twice — inside CellDecoration when the whole block is decorated, and bare
// otherwise — rather than duplicating the loop markup per branch.
defineProps<{
  block: JournalNavBlock;
  journal: JournalConfig;
  refDate: AnchorString;
  editable?: boolean;
  shelf?: string | null;
}>();

defineEmits<{ edit: [lineIndex: number, segmentIndex: number] }>();

// Own the line's container element here and hand it out through the lineAction slot, rather
// than letting a slot consumer reach for it via the DOM (e.g. its own root's parentElement) —
// this stays correct if this template's line markup ever changes shape.
const lineEls = ref<(HTMLElement | null)[]>([]);
function setLineEl(index: number, el: Element | null): void {
  // Plain instanceof, not Obsidian's cross-window-safe .instanceOf(): that method only
  // exists once the real app installs it, so it throws under the test environment's DOM.
  lineEls.value[index] = el instanceof HTMLElement ? el : null;
}
</script>

<template>
  <slot name="beforeLines" />
  <template v-for="(line, lineIndex) of block.lines" :key="lineIndex">
    <div
      :ref="(el) => setLineEl(lineIndex, el as Element | null)"
      class="nav-block-line"
      :class="{ 'nav-block-line--multi': line.length > 1 }"
    >
      <NavBlockSegment
        v-for="(segment, segmentIndex) of line"
        :key="segmentIndex"
        :journal
        :segment
        :ref-date="refDate"
        :editable
        :shelf
        :drag-id="editable ? `${lineIndex}:${segmentIndex}` : undefined"
        @edit="$emit('edit', lineIndex, segmentIndex)"
      />
      <slot
        name="lineAction"
        :index="lineIndex"
        :is-first="lineIndex === 0"
        :is-last="lineIndex === block.lines.length - 1"
        :line-el="lineEls[lineIndex] ?? null"
      />
    </div>
    <slot name="afterLine" :index="lineIndex" />
  </template>
</template>

<style scoped>
.nav-block-line {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: baseline;
  gap: 0 0.35em;
}
/* A lone segment fills its line, so the background band its colour paints and its click target
   span the whole block — the shape a row had before a line could hold more than one. */
.nav-block-line > .nav-row {
  flex: 1 1 auto;
  min-width: 0;
}
/* Several segments hug their own text and cluster at the centre instead of sharing the line's
   width equally, which spreads them apart on a wide column and reads as separate columns
   rather than one phrase. It also keeps each segment's background behind its own words. */
.nav-block-line--multi > .nav-row {
  flex: 0 1 auto;
}
</style>
