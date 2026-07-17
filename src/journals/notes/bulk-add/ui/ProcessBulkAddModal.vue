<script setup lang="ts">
import { match } from "ts-pattern";
import { ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import {
  BulkAddService,
  type BulkLogAction,
  type BulkLogEntry,
  type BulkPlan,
  type PlannedAction,
  type PlannedSkip,
  type SkipReason,
} from "../bulk-add-service";

import type { BulkAddParameters } from "../config";

const props = defineProps<{ journalName: string; plan: BulkPlan; parameters: BulkAddParameters }>();
const api = useModal();
const service = useService(BulkAddService);

const actions = props.plan.notes.filter((n): n is PlannedAction => n.kind === "action");
const skips = props.plan.notes.filter((n): n is PlannedSkip => n.kind === "skip");

// A dry run reports what *would* happen, a real run what did. The service returns the actions as
// data precisely so the wording can carry that difference — otherwise a dry run reads exactly
// like a completed one and the user believes their notes were changed.
function actionLabel(action: BulkLogAction): string {
  const mood = props.parameters.dryRun ? "planned" : "done";
  return match(action)
    .with({ kind: "skipped-occupied" }, (a) => m.bulk_add_log_skipped_occupied({ mood, anchor: a.anchor }))
    .with({ kind: "merged" }, (a) => m.bulk_add_log_merged({ mood, anchor: a.anchor }))
    .with({ kind: "replaced" }, (a) => m.bulk_add_log_replaced({ mood, anchor: a.anchor }))
    .with({ kind: "moved" }, () => m.bulk_add_log_moved({ mood }))
    .with({ kind: "renamed" }, () => m.bulk_add_log_renamed({ mood }))
    .with({ kind: "connected" }, (a) =>
      m.bulk_add_log_connected({ mood, journalName: a.journalName, anchor: a.anchor }),
    )
    .with({ kind: "merge-occupant-missing" }, () => m.bulk_add_log_merge_occupant_missing())
    .with({ kind: "failed" }, (a) => m.bulk_add_log_failed({ message: a.message }))
    .exhaustive();
}

function skipReasonLabel(reason: SkipReason): string {
  return match(reason)
    .with("already-connected", () => m.bulk_add_skip_reason_already_connected())
    .with("filtered", () => m.bulk_add_skip_reason_filtered())
    .with("no-date", () => m.bulk_add_skip_reason_no_date())
    .with("invalid-date", () => m.bulk_add_skip_reason_invalid_date())
    .with("out-of-bounds", () => m.bulk_add_skip_reason_out_of_bounds())
    .exhaustive();
}

const existing = ref<Record<string, "skip" | "override" | "merge">>(
  Object.fromEntries(actions.map((a) => [a.path, a.existing === "ask" || a.existing === "none" ? "skip" : a.existing])),
);

const folderDecision = ref<Record<string, "keep" | "move">>(
  Object.fromEntries(actions.map((a) => [a.path, a.folder === "move" ? "move" : "keep"])),
);

const nameDecision = ref<Record<string, "keep" | "rename">>(
  Object.fromEntries(actions.map((a) => [a.path, a.name === "rename" ? "rename" : "keep"])),
);

const log = ref<BulkLogEntry[] | null>(null);
const progress = ref<{ done: number; total: number } | null>(null);

function setExisting(path: string, value: string): void {
  if (value === "skip" || value === "override" || value === "merge") {
    existing.value[path] = value;
  }
}

function setFolder(path: string, value: "keep" | "move"): void {
  folderDecision.value[path] = value;
}

function setName(path: string, value: "keep" | "rename"): void {
  nameDecision.value[path] = value;
}

async function run(): Promise<void> {
  const resolved = service.resolve(actions, {
    existing: existing.value,
    folder: folderDecision.value,
    name: nameDecision.value,
  });
  progress.value = { done: 0, total: resolved.length };
  const result = await service.apply(props.journalName, resolved, props.parameters.dryRun, (done, total) => {
    progress.value = { done, total };
  });
  progress.value = null;
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
        <template v-if="action.occupant !== undefined || action.targetPath !== action.path" #description>
          <div v-if="action.occupant !== undefined">{{ m.bulk_add_occupant({ path: action.occupant }) }}</div>
          <div v-if="action.targetPath !== action.path">{{ m.bulk_add_target({ path: action.targetPath }) }}</div>
        </template>
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
        <UiDropdown
          v-if="action.folder === 'ask'"
          :aria-label="m.bulk_add_other_folder_label()"
          :value="folderDecision[action.path]"
          @change="setFolder(action.path, ($event.target as HTMLSelectElement).value as 'keep' | 'move')"
        >
          <option value="keep">{{ m.bulk_add_option_keep() }}</option>
          <option value="move">{{ m.bulk_add_option_move() }}</option>
        </UiDropdown>
        <UiDropdown
          v-if="action.name === 'ask'"
          :aria-label="m.bulk_add_other_name_label()"
          :value="nameDecision[action.path]"
          @change="setName(action.path, ($event.target as HTMLSelectElement).value as 'keep' | 'rename')"
        >
          <option value="keep">{{ m.bulk_add_option_keep() }}</option>
          <option value="rename">{{ m.bulk_add_option_rename() }}</option>
        </UiDropdown>
      </UiSettingRow>
      <UiSettingRow v-for="skip of skips" :key="skip.path" no-controls>
        <template #name>{{ skip.path }}</template>
        <template #description>{{ skipReasonLabel(skip.reason) }}</template>
      </UiSettingRow>
      <UiSettingRow v-if="progress" no-controls>
        <template #description>{{ m.bulk_add_progress({ done: progress.done, total: progress.total }) }}</template>
      </UiSettingRow>
      <UiSettingRow v-else>
        <UiButton cta @click="run">{{ m.bulk_add_run() }}</UiButton>
      </UiSettingRow>
    </template>

    <template v-else>
      <UiSettingRow v-if="parameters.dryRun" heading no-controls :name="m.bulk_add_dry_run_banner()" />
      <UiSettingRow v-for="entry of log" :key="entry.path">
        <template #name>{{ entry.path }}</template>
        <template #description>
          <div v-for="(action, i) of entry.actions" :key="i">{{ actionLabel(action) }}</div>
        </template>
      </UiSettingRow>
      <UiSettingRow>
        <UiButton cta @click="close">{{ m.common_action_close() }}</UiButton>
      </UiSettingRow>
    </template>
  </div>
</template>
