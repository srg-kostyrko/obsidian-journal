<script setup lang="ts">
import { ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { BulkAddService, type BulkLogEntry, type BulkPlan, type PlannedAction } from "../bulk-add-service";

import type { BulkAddParameters } from "../config";

const props = defineProps<{ journalName: string; plan: BulkPlan; parameters: BulkAddParameters }>();
const api = useModal();
const service = useService(BulkAddService);

const actions = props.plan.notes.filter((n): n is PlannedAction => n.kind === "action");
const skips = props.plan.notes.filter((n) => n.kind === "skip");

const existing = ref<Record<string, "skip" | "override" | "merge">>(
  Object.fromEntries(actions.map((a) => [a.path, a.existing === "ask" || a.existing === "none" ? "skip" : a.existing])),
);

const log = ref<BulkLogEntry[] | null>(null);

function setExisting(path: string, value: string): void {
  if (value === "skip" || value === "override" || value === "merge") {
    existing.value[path] = value;
  }
}

async function run(): Promise<void> {
  const resolved = actions.map((a) => ({
    path: a.path,
    anchor: a.anchor,
    existing: a.occupant === undefined ? ("none" as const) : (existing.value[a.path] ?? "skip"),
    move: a.folder === "ask" ? false : a.folder === "move",
    rename: a.name === "ask" ? false : a.name === "rename",
  }));
  const result = await service.apply(props.journalName, resolved, props.parameters.dryRun);
  if (result.kind === "ok") log.value = result.value;
}

function close(): void {
  // Normal completion — submit (void). The flow maps cancel/dismiss to UserAborted.
  api.submit();
}
</script>

<template>
  <div>
    <UiSettingRow no-controls>
      <template #description>
        {{ m.bulk_add_planned_count({ count: actions.length }) }} ·
        {{ m.bulk_add_skipped_count({ count: skips.length }) }}
      </template>
    </UiSettingRow>

    <template v-if="log === null">
      <UiSettingRow v-for="action of actions" :key="action.path">
        <template #name>{{ action.path }} → {{ action.anchor }}</template>
        <UiDropdown
          v-if="action.occupant !== undefined && action.existing === 'ask'"
          :aria-label="m.bulk_add_existing_label()"
          :value="existing[action.path]"
          @change="setExisting(action.path, ($event.target as HTMLSelectElement).value)"
        >
          <option value="skip">{{ m.bulk_add_option_skip() }}</option>
          <option value="override">{{ m.bulk_add_option_override() }}</option>
          <option value="merge">{{ m.bulk_add_option_merge() }}</option>
        </UiDropdown>
      </UiSettingRow>
      <UiSettingRow>
        <UiButton cta @click="run">{{ m.bulk_add_run() }}</UiButton>
      </UiSettingRow>
    </template>

    <template v-else>
      <UiSettingRow v-for="entry of log" :key="entry.path">
        <template #name>{{ entry.path }}</template>
        <template #description>
          <div v-for="(line, i) of entry.actions" :key="i">{{ line }}</div>
        </template>
      </UiSettingRow>
      <UiSettingRow>
        <UiButton cta @click="close">{{ m.bulk_add_close() }}</UiButton>
      </UiSettingRow>
    </template>
  </div>
</template>
