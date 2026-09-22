<script setup lang="ts">
import { match } from "ts-pattern";
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { SettingsService } from "@/settings";
import type { TaskStatus } from "@/tasks";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

import { CHECKBOX_STATUSES } from "../normalize";
import { checkboxSlice } from "../slice";

const slice = useService(SettingsService).getSlice(checkboxSlice);
const newSymbol = ref("");

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

const canAdd = computed(() => {
  const trimmed = newSymbol.value.trim();
  return trimmed.length > 0 && !Object.hasOwn(slice.state.statusMap, trimmed);
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

// Read off the message rather than spelled out here, so renaming or dropping a variant in en.json
// breaks the mapping below at compile time.
type WriteSymbolStatus = Parameters<typeof m.tasks_settings_write_symbol>[0]["status"];

// This row names the status inside a sentence, so the status travels as a *selector* and each
// variant spells the whole phrase — a status noun spliced in as a parameter cannot decline in the
// locales that govern case. The stored type names carry hyphens where the selector values carry
// underscores, and the todo fallback is load-bearing either way: paraglide answers a value it has
// no variant for with the bare message key, which would render on screen.
function writeSymbolLabel(status: string): string {
  const selector = match(status)
    .returnType<WriteSymbolStatus>()
    .with("todo", "done", "cancelled", "rolled", (known) => known)
    .with("in-progress", () => "in_progress")
    .with("on-hold", () => "on_hold")
    .with("non-task", () => "non_task")
    .otherwise(() => "todo");
  return m.tasks_settings_write_symbol({ status: selector });
}

function addSymbol(): void {
  const trimmed = newSymbol.value.trim();
  if (trimmed.length === 0 || Object.hasOwn(slice.state.statusMap, trimmed)) return;
  slice.state.statusMap[trimmed] = "todo" satisfies TaskStatus;
  newSymbol.value = "";
}

// A removed symbol can be the very one canonical[type] writes back — left alone, writing that
// status would emit a symbol nothing reads as that status any more. Reassign to another surviving
// candidate for the type, or drop the write mapping entirely once none is left, rather than leave
// canonical pointing at a symbol statusMap no longer knows.
function removeSymbol(symbol: string): void {
  const type = slice.state.statusMap[symbol];
  delete slice.state.statusMap[symbol];
  if (type === undefined || slice.state.canonical[type] !== symbol) return;
  const remaining = Object.entries(slice.state.statusMap)
    .filter(([, candidateType]) => candidateType === type)
    .map(([candidateSymbol]) => candidateSymbol);
  const [fallback] = remaining;
  if (fallback === undefined) delete slice.state.canonical[type];
  else slice.state.canonical[type] = fallback;
}
</script>

<template>
  <UiSettingRow :name="m.tasks_settings_status_map()" stacked>
    <template #description>{{ m.tasks_settings_status_map_desc() }}</template>
    <div v-for="symbol in symbols" :key="symbol" class="tasks-status-map-row" :data-testid="`status-map-row-${symbol}`">
      <span class="tasks-status-map-symbol">{{ symbol }}</span>
      <UiDropdown v-model="slice.state.statusMap[symbol]">
        <option v-for="status in CHECKBOX_STATUSES" :key="status" :value="status">{{ statusLabel(status) }}</option>
      </UiDropdown>
      <UiIconButton
        :icon="icons.action.delete"
        :tooltip="m.common_action_delete()"
        :data-testid="`status-map-remove-${symbol}`"
        @click="removeSymbol(symbol)"
      />
    </div>
    <div class="tasks-status-map-row">
      <UiTextInput
        v-model="newSymbol"
        :aria-label="m.tasks_settings_new_symbol_label()"
        data-testid="status-map-new-symbol"
      />
      <UiButton :disabled="!canAdd" data-testid="status-map-add" @click="addSymbol">
        {{ m.tasks_settings_add_symbol() }}
      </UiButton>
    </div>
  </UiSettingRow>
  <UiSettingRow v-for="[type, candidates] in candidatesByType" :key="type" :name="writeSymbolLabel(type)">
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
