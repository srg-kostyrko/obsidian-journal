<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { SettingsService } from "@/settings";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { CHECKBOX_STATUSES } from "../normalize";
import { checkboxSlice } from "../slice";

const slice = useService(SettingsService).getSlice(checkboxSlice);

const symbols = computed(() => Object.keys(slice.state.statusMap));

// Grouped so the write-symbol picker offers only symbols that actually read as that status —
// e.g. "x" and "X" both read as done by default, so canonical.done picks between those two,
// never between every configured symbol.
const candidatesByType = computed(() => {
  const grouped = new Map<string, string[]>();
  for (const [symbol, type] of Object.entries(slice.state.statusMap)) {
    const bucket = grouped.get(type) ?? [];
    bucket.push(symbol);
    grouped.set(type, bucket);
  }
  return grouped;
});
</script>

<template>
  <UiSettingRow :name="m.tasks_settings_status_map()" stacked>
    <template #description>{{ m.tasks_settings_status_map_desc() }}</template>
    <div v-for="symbol in symbols" :key="symbol" class="tasks-status-map-row" :data-testid="`status-map-row-${symbol}`">
      <span class="tasks-status-map-symbol">{{ symbol }}</span>
      <UiDropdown v-model="slice.state.statusMap[symbol]">
        <option v-for="status in CHECKBOX_STATUSES" :key="status" :value="status">{{ status }}</option>
      </UiDropdown>
    </div>
  </UiSettingRow>
  <UiSettingRow
    v-for="[type, candidates] in candidatesByType"
    :key="type"
    :name="m.tasks_settings_write_symbol({ status: type })"
  >
    <UiButton
      v-for="symbol in candidates"
      :key="symbol"
      :cta="slice.state.canonical[type] === symbol"
      :data-testid="`canonical-${type}-${symbol}`"
      @click="slice.state.canonical[type] = symbol"
    >
      {{ symbol }}
    </UiButton>
  </UiSettingRow>
</template>

<style scoped>
.tasks-status-map-row {
  display: flex;
  align-items: center;
  gap: var(--size-2-2);
}
.tasks-status-map-symbol {
  font-family: var(--font-monospace);
  min-width: var(--size-4-4);
  text-align: center;
}
</style>
