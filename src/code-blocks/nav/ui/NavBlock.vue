<script setup lang="ts">
import type { AnchorString, Period } from "@/calendar";
import { CellDecoration, type CellDecorationScope } from "@/decorations";
import type { JournalConfig, JournalNavBlock } from "@/journals";

import NavBlockLines from "./NavBlockLines.vue";

// blockScope names the provided decoration map the whole-block decoration draws from (see
// decoration-scopes.ts). Each segment derives its own per-segment scope from its resolved link
// target, so it needs no scope prop here.
defineProps<{
  block: JournalNavBlock;
  journal: JournalConfig;
  refDate: AnchorString;
  period: Period;
  editable?: boolean;
  blockScope?: CellDecorationScope;
  shelf?: string | null;
}>();

defineEmits<{ edit: [lineIndex: number, segmentIndex: number] }>();
</script>

<template>
  <div class="nav-block">
    <CellDecoration v-if="block.decorateWholeBlock" :period="period" :scope="blockScope" class="nav-block-inner">
      <NavBlockLines :block :journal :ref-date="refDate" :editable :shelf @edit="(l, s) => $emit('edit', l, s)">
        <template #beforeLines><slot name="beforeLines" /></template>
        <template #lineAction="slotProps"><slot name="lineAction" v-bind="slotProps" /></template>
        <template #afterLine="slotProps"><slot name="afterLine" v-bind="slotProps" /></template>
      </NavBlockLines>
    </CellDecoration>
    <NavBlockLines v-else :block :journal :ref-date="refDate" :editable :shelf @edit="(l, s) => $emit('edit', l, s)">
      <template #beforeLines><slot name="beforeLines" /></template>
      <template #lineAction="slotProps"><slot name="lineAction" v-bind="slotProps" /></template>
      <template #afterLine="slotProps"><slot name="afterLine" v-bind="slotProps" /></template>
    </NavBlockLines>
  </div>
</template>

<style scoped>
.nav-block {
  display: flex;
  flex-direction: column;
  text-align: center;
}
</style>
