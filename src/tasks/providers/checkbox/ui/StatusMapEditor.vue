<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import type { TaskStatus } from "@/tasks";
import { TASK_STATUSES } from "@/tasks/status";
import { taskStatusLabel } from "@/tasks/ui/status-label";
import { icons } from "@/ui/icons";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

const statusMap = defineModel<Record<string, string>>("statusMap", { required: true });
const canonical = defineModel<Record<string, string>>("canonical", { required: true });
const newSymbol = ref("");

const symbols = computed(() => Object.keys(statusMap.value));

// A marker is the one character between the brackets, so anything longer can never match a real
// checkbox — and it would still show up as a candidate for `canonical`, where picking it puts a
// string into `canonical` that a writer would emit back into the note. Counted in code points: an
// emoji marker is one character to the user and two to `.length`.
function isMarker(text: string): boolean {
  return [...text].length === 1;
}

const canAdd = computed(() => {
  const trimmed = newSymbol.value.trim();
  return isMarker(trimmed) && !Object.hasOwn(statusMap.value, trimmed);
});

function addSymbol(): void {
  const trimmed = newSymbol.value.trim();
  if (!isMarker(trimmed) || Object.hasOwn(statusMap.value, trimmed)) return;
  statusMap.value[trimmed] = "todo" satisfies TaskStatus;
  newSymbol.value = "";
}

// A symbol can stop answering for a status two ways — removed outright, or remapped to some other
// status — and canonical[type] may be pointing at exactly that symbol. Left alone, writing that
// status emits a marker normalizeStatus reads back as something else, so the round trip breaks.
// Reassign to another surviving candidate for the type, or drop the write mapping entirely once
// none is left, rather than leave canonical pointing at a symbol that no longer reads as it.
function repairCanonical(type: string | undefined, symbol: string): void {
  if (type === undefined || canonical.value[type] !== symbol) return;
  const remaining = Object.entries(statusMap.value)
    .filter(([, candidateType]) => candidateType === type)
    .map(([candidateSymbol]) => candidateSymbol);
  const [fallback] = remaining;
  if (fallback === undefined) delete canonical.value[type];
  else canonical.value[type] = fallback;
}

function removeSymbol(symbol: string): void {
  const type = statusMap.value[symbol];
  delete statusMap.value[symbol];
  repairCanonical(type, symbol);
}

function remapSymbol(symbol: string, status: string): void {
  const previous = statusMap.value[symbol];
  if (previous === status) return;
  statusMap.value[symbol] = status;
  repairCanonical(previous, symbol);
}

function isCurrent(symbol: string): boolean {
  const type = statusMap.value[symbol];
  return type !== undefined && canonical.value[type] === symbol;
}

function makeCurrent(symbol: string): void {
  const type = statusMap.value[symbol];
  if (type === undefined) return;
  canonical.value[type] = symbol;
}

function symbolLabel(symbol: string): string {
  return symbol === " " ? m.tasks_settings_space_symbol() : symbol;
}
</script>

<template>
  <UiSettingRow :name="m.tasks_settings_status_map()">
    <template #description>{{ m.tasks_settings_status_map_desc() }}</template>
    <UiTextInput
      v-model="newSymbol"
      class="tasks-status-map-new-symbol"
      :aria-label="m.tasks_settings_new_symbol_label()"
      data-testid="status-map-new-symbol"
      @keydown.enter="addSymbol"
    />
    <UiIconButton
      :icon="icons.action.add"
      :tooltip="m.tasks_settings_add_symbol()"
      :disabled="!canAdd"
      data-testid="status-map-add"
      @click="addSymbol"
    />
  </UiSettingRow>
  <UiSettingRow
    v-for="symbol in symbols"
    :key="symbol"
    controls-only
    class="tasks-status-map-row"
    :data-testid="`status-map-row-${symbol}`"
  >
    <span class="tasks-status-map-symbol">{{ symbolLabel(symbol) }}</span>
    <UiDropdown
      class="tasks-status-map-grow"
      :model-value="statusMap[symbol]"
      @update:model-value="remapSymbol(symbol, $event)"
    >
      <option v-for="status in TASK_STATUSES" :key="status" :value="status">{{ taskStatusLabel(status) }}</option>
    </UiDropdown>
    <UiIconButton
      :icon="icons.action.writtenBack"
      :tooltip="m.tasks_settings_written_back_tooltip()"
      :data-testid="`written-back-${symbol}`"
      :data-current="isCurrent(symbol) || null"
      :class="{ 'tasks-written-back-current': isCurrent(symbol) }"
      @click="makeCurrent(symbol)"
    />
    <UiIconButton
      :icon="icons.action.delete"
      :tooltip="m.common_action_delete()"
      :data-testid="`status-map-remove-${symbol}`"
      @click="removeSymbol(symbol)"
    />
  </UiSettingRow>
</template>

<style scoped>
.tasks-status-map-new-symbol {
  width: var(--size-4-12);
  text-align: center;
}
.tasks-status-map-row :deep(.setting-item-control) {
  flex: 1;
}
.tasks-status-map-symbol {
  width: var(--size-4-8);
  font-family: var(--font-monospace);
  text-align: center;
}
.tasks-status-map-grow {
  flex-grow: 1;
  max-width: none;
}
.tasks-written-back-current {
  color: var(--color-accent);
}
</style>
