<script setup lang="ts">
import type { AnchorString, Period } from "@/calendar";
import { CellDecoration, type CellDecorationScope } from "@/decorations";
import type { JournalConfig, JournalNavBlock } from "@/journals";

import NavBlockRow from "./NavBlockRow.vue";

// blockScope/rowScope name the provided decoration maps the whole-block and per-row decorations
// draw from. v2 scopes them differently, so the nav code block passes two distinct scopes; the
// custom-interval view passes neither and both fall back to the default (its single provided map).
defineProps<{
  block: JournalNavBlock;
  journal: JournalConfig;
  refDate: AnchorString;
  period: Period;
  preventNavigation?: boolean;
  blockScope?: CellDecorationScope;
  rowScope?: CellDecorationScope;
}>();
</script>

<template>
  <div class="nav-block">
    <CellDecoration v-if="block.decorateWholeBlock" :period="period" :scope="blockScope" class="nav-block-inner">
      <div v-for="(row, index) of block.rows" :key="index" class="nav-block-line">
        <NavBlockRow
          :journal
          :row
          :ref-date="refDate"
          :period
          :prevent-navigation="preventNavigation"
          :decoration-scope="rowScope"
        />
        <slot name="rowAction" :index :is-first="index === 0" :is-last="index === block.rows.length - 1" />
      </div>
    </CellDecoration>
    <template v-else>
      <div v-for="(row, index) of block.rows" :key="index" class="nav-block-line">
        <NavBlockRow
          :journal
          :row
          :ref-date="refDate"
          :period
          :prevent-navigation="preventNavigation"
          :decoration-scope="rowScope"
        />
        <slot name="rowAction" :index :is-first="index === 0" :is-last="index === block.rows.length - 1" />
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
}
</style>
