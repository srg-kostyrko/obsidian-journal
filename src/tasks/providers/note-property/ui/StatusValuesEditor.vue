<script setup lang="ts">
import { m } from "@/i18n";
import type { TaskStatus } from "@/tasks";
import { TASK_STATUSES } from "@/tasks/status";
import { taskStatusLabel } from "@/tasks/ui/status-label";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

import type { CanonicalMark, StatusValueRow } from "../form";

const rows = defineModel<StatusValueRow[]>("rows", { required: true });
const canonical = defineModel<Record<string, CanonicalMark>>("canonical", { required: true });

function marks(type: string, row: StatusValueRow): boolean {
  const mark = canonical.value[type];
  return mark !== undefined && "row" in mark && mark.row === row.id;
}

// A row can stop answering for a status two ways — removed, or remapped — and canonical[type] may
// point at exactly that row. Left alone, ticking to that status writes a value that reads back as
// something else, so the mark moves to another row of the type. With none left it is dropped —
// except a removed to-do value: an unknown value reads as to-do, so it still round-trips and stays.
function repairCanonical(type: string, row: StatusValueRow, removed: boolean): void {
  if (!marks(type, row)) return;
  const fallback = rows.value.find((candidate) => candidate.status === type);
  const value = row.value.trim();
  if (fallback !== undefined) canonical.value[type] = { row: fallback.id };
  else if (removed && type === "todo" && value !== "") canonical.value[type] = { value };
  else delete canonical.value[type];
}

function addRow(): void {
  const id = Math.max(-1, ...rows.value.map((row) => row.id)) + 1;
  rows.value.push({ id, value: "", status: "todo" satisfies TaskStatus });
}

function removeRow(row: StatusValueRow): void {
  const index = rows.value.findIndex((candidate) => candidate.id === row.id);
  if (index === -1) return;
  rows.value.splice(index, 1);
  repairCanonical(row.status, row, true);
}

function remapRow(row: StatusValueRow, status: string): void {
  const previous = row.status;
  if (previous === status) return;
  row.status = status;
  repairCanonical(previous, row, false);
}

function isCurrent(row: StatusValueRow): boolean {
  return marks(row.status, row);
}

function makeCurrent(row: StatusValueRow): void {
  canonical.value[row.status] = { row: row.id };
}
</script>

<template>
  <div class="tasks-status-values-rows">
    <div class="tasks-status-values-head">
      <span></span>
      <span></span>
      <span>{{ m.tasks_settings_written_back() }}</span>
      <span></span>
    </div>
    <div
      v-for="(row, index) in rows"
      :key="row.id"
      class="tasks-status-values-row"
      :data-testid="`note-property-status-row-${index}`"
    >
      <UiTextInput
        v-model="row.value"
        :aria-label="m.tasks_note_property_status_value_label()"
        :data-testid="`note-property-status-value-${index}`"
      />
      <UiDropdown :model-value="row.status" @update:model-value="remapRow(row, $event)">
        <option v-for="status in TASK_STATUSES" :key="status" :value="status">{{ taskStatusLabel(status) }}</option>
      </UiDropdown>
      <UiIconButton
        :icon="icons.action.writtenBack"
        :tooltip="m.tasks_note_property_written_back_tooltip()"
        :data-testid="`note-property-written-back-${index}`"
        :data-current="isCurrent(row) || null"
        :class="{ 'tasks-written-back-current': isCurrent(row) }"
        @click="makeCurrent(row)"
      />
      <UiIconButton
        :icon="icons.action.delete"
        :tooltip="m.common_action_delete()"
        :data-testid="`note-property-status-remove-${index}`"
        @click="removeRow(row)"
      />
    </div>
    <div>
      <UiButton data-testid="note-property-add-status-value" @click="addRow">
        {{ m.tasks_note_property_add_value() }}
      </UiButton>
    </div>
  </div>
</template>

<style scoped>
/* UiSettingRow's stacked control is one no-wrap line by contract; this lays out its own lines. */
.tasks-status-values-rows {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-2);
}
.tasks-status-values-row,
.tasks-status-values-head {
  display: grid;
  grid-template-columns: 12em 10em auto auto;
  align-items: center;
  gap: var(--size-2-2);
}
.tasks-status-values-head {
  font-size: var(--font-ui-smaller);
  color: var(--text-faint);
  text-transform: uppercase;
}
.tasks-written-back-current {
  color: var(--color-accent);
}
</style>
