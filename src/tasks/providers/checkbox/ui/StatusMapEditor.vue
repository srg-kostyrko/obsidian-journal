<script setup lang="ts">
import { match } from "ts-pattern";
import { computed, ref } from "vue";

import { m } from "@/i18n";
import type { TaskStatus } from "@/tasks";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

import { CHECKBOX_STATUSES } from "../normalize";

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

// Every status name a symbol can read as is a full phrase from the message catalogue, never the
// bare TaskStatus identifier — an identifier spliced into a sentence survives translation
// unchanged and cannot agree with the surrounding phrase in a gendered locale. Accepts a plain
// string (not narrowed to TaskStatus) because a stored statusMap value is schema-checked only as
// "some string", the same reason normalizeStatus falls back to todo for a name it doesn't
// recognize rather than throwing.
function statusLabel(status: string): string {
  return match(status)
    .with("todo", () => m.tasks_status_todo())
    .with("done", () => m.tasks_status_done())
    .with("in-progress", () => m.tasks_status_in_progress())
    .with("cancelled", () => m.tasks_status_cancelled())
    .with("on-hold", () => m.tasks_status_on_hold())
    .with("non-task", () => m.tasks_status_non_task())
    .with("rolled", () => m.tasks_status_rolled())
    .otherwise(() => m.tasks_status_todo());
}

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
  <UiSettingRow :name="m.tasks_settings_status_map()" stacked>
    <template #description>{{ m.tasks_settings_status_map_desc() }}</template>
    <div class="tasks-status-map-rows" data-testid="status-map-rows">
      <div class="tasks-status-map-head">
        <span></span>
        <span></span>
        <span>{{ m.tasks_settings_written_back() }}</span>
        <span></span>
      </div>
      <div
        v-for="symbol in symbols"
        :key="symbol"
        class="tasks-status-map-row"
        :data-testid="`status-map-row-${symbol}`"
      >
        <span class="tasks-status-map-symbol">{{ symbolLabel(symbol) }}</span>
        <UiDropdown :model-value="statusMap[symbol]" @update:model-value="remapSymbol(symbol, $event)">
          <option v-for="status in CHECKBOX_STATUSES" :key="status" :value="status">{{ statusLabel(status) }}</option>
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
      </div>
      <div class="tasks-status-map-row">
        <span></span>
        <UiTextInput
          v-model="newSymbol"
          :aria-label="m.tasks_settings_new_symbol_label()"
          data-testid="status-map-new-symbol"
        />
        <UiButton :disabled="!canAdd" data-testid="status-map-add" @click="addSymbol">
          {{ m.tasks_settings_add_symbol() }}
        </UiButton>
      </div>
    </div>
  </UiSettingRow>
</template>

<style scoped>
/* UiSettingRow's stacked control is one no-wrap line by contract — a control needing several
   lines lays them out itself, which is what this wrapper does. */
.tasks-status-map-rows {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-2);
}
.tasks-status-map-row,
.tasks-status-map-head {
  display: grid;
  grid-template-columns: var(--size-4-8) 10em auto auto;
  align-items: center;
  gap: var(--size-2-2);
}
.tasks-status-map-head {
  font-size: var(--font-ui-smaller);
  color: var(--text-faint);
  text-transform: uppercase;
}
.tasks-status-map-symbol {
  font-family: var(--font-monospace);
  text-align: center;
}
.tasks-written-back-current {
  color: var(--color-accent);
}
</style>
