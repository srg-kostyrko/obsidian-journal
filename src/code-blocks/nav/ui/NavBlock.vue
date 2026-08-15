<script setup lang="ts">
import type { AnchorString, Period } from "@/calendar";
import { CellDecoration, type CellDecorationScope } from "@/decorations";
import type { JournalConfig, JournalNavBlock } from "@/journals";

import NavBlockRow from "./NavBlockRow.vue";

// blockScope/rowScope name the provided decoration maps the whole-block and per-row decorations
// draw from (see decoration-scopes.ts). The nav code block passes two distinct scopes since the
// two decorate differently; the custom-interval view passes neither, so both fall back to the
// default — its single provided map.
defineProps<{
  block: JournalNavBlock;
  journal: JournalConfig;
  refDate: AnchorString;
  period: Period;
  preventNavigation?: boolean;
  blockScope?: CellDecorationScope;
  rowScope?: CellDecorationScope;
  shelf?: string | null;
}>();
</script>

<template>
  <div class="nav-block">
    <CellDecoration v-if="block.decorateWholeBlock" :period="period" :scope="blockScope" class="nav-block-inner">
      <div v-for="(line, lineIndex) of block.lines" :key="lineIndex" class="nav-block-line">
        <NavBlockRow
          v-for="(segment, segmentIndex) of line"
          :key="segmentIndex"
          :journal
          :row="segment"
          :ref-date="refDate"
          :period
          :prevent-navigation="preventNavigation"
          :decoration-scope="rowScope"
          :shelf
        />
        <slot
          name="lineAction"
          :index="lineIndex"
          :is-first="lineIndex === 0"
          :is-last="lineIndex === block.lines.length - 1"
        />
      </div>
    </CellDecoration>
    <template v-else>
      <div v-for="(line, lineIndex) of block.lines" :key="lineIndex" class="nav-block-line">
        <NavBlockRow
          v-for="(segment, segmentIndex) of line"
          :key="segmentIndex"
          :journal
          :row="segment"
          :ref-date="refDate"
          :period
          :prevent-navigation="preventNavigation"
          :decoration-scope="rowScope"
          :shelf
        />
        <slot
          name="lineAction"
          :index="lineIndex"
          :is-first="lineIndex === 0"
          :is-last="lineIndex === block.lines.length - 1"
        />
      </div>
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
