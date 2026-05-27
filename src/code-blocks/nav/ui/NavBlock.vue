<script setup lang="ts">
import type { AnchorString, Period } from "@/calendar";
import { CellDecoration } from "@/decorations";
import type { JournalConfig } from "@/journals";

import NavBlockRow from "./NavBlockRow.vue";

defineProps<{
  journal: JournalConfig;
  refDate: AnchorString;
  period: Period;
  preventNavigation?: boolean;
}>();
</script>

<template>
  <div class="nav-block">
    <CellDecoration v-if="journal.navBlock.decorateWholeBlock" :period="period" class="nav-block-inner">
      <div v-for="(row, index) of journal.navBlock.rows" :key="index">
        <NavBlockRow :journal :row :ref-date="refDate" :period :prevent-navigation="preventNavigation" />
      </div>
    </CellDecoration>
    <template v-else>
      <div v-for="(row, index) of journal.navBlock.rows" :key="index">
        <NavBlockRow :journal :row :ref-date="refDate" :period :prevent-navigation="preventNavigation" />
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
</style>
