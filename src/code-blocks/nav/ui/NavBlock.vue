<script setup lang="ts">
import { ref } from "vue";

import type { AnchorString, Period } from "@/calendar";
import { CellDecoration, type CellDecorationScope } from "@/decorations";
import type { JournalConfig, JournalNavBlock } from "@/journals";

import NavBlockSegment from "./NavBlockSegment.vue";

// blockScope names the provided decoration map the whole-block decoration draws from (see
// decoration-scopes.ts). Each segment derives its own per-segment scope from its resolved link
// target, so it needs no scope prop here.
defineProps<{
  block: JournalNavBlock;
  journal: JournalConfig;
  refDate: AnchorString;
  period: Period;
  preventNavigation?: boolean;
  editable?: boolean;
  blockScope?: CellDecorationScope;
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
  <div class="nav-block">
    <CellDecoration v-if="block.decorateWholeBlock" :period="period" :scope="blockScope" class="nav-block-inner">
      <template v-for="(line, lineIndex) of block.lines" :key="lineIndex">
        <div :ref="(el) => setLineEl(lineIndex, el as Element | null)" class="nav-block-line">
          <NavBlockSegment
            v-for="(segment, segmentIndex) of line"
            :key="segmentIndex"
            :journal
            :segment
            :ref-date="refDate"
            :prevent-navigation="preventNavigation"
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
    </CellDecoration>
    <template v-else>
      <template v-for="(line, lineIndex) of block.lines" :key="lineIndex">
        <div :ref="(el) => setLineEl(lineIndex, el as Element | null)" class="nav-block-line">
          <NavBlockSegment
            v-for="(segment, segmentIndex) of line"
            :key="segmentIndex"
            :journal
            :segment
            :ref-date="refDate"
            :prevent-navigation="preventNavigation"
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
  </div>
</template>

<style scoped>
.nav-block {
  display: flex;
  flex-direction: column;
  text-align: center;
}
.nav-block-line {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: baseline;
  gap: 0 0.35em;
}
.nav-block-line > .nav-row {
  flex: 1 1 auto;
  min-width: 0;
}
</style>
