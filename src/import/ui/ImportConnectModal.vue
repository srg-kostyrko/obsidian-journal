<script setup lang="ts">
import { match } from "ts-pattern";
import { ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModal } from "@/infrastructure/host/modals";
import { invertibilityWarningText } from "@/journals/notes/invertibility";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import {
  ImportConnectService,
  type ConnectPlan,
  type ConnectReport,
  type ConnectRowPlan,
  type ConnectSkipReason,
} from "../connect-service";

import type { ImportOutcome, RowOutcome, ShelfOutcome, StartupOutcome } from "../import-service";

const { outcome, connect } = defineProps<{ outcome: ImportOutcome; connect: ConnectPlan }>();
const api = useModal();
const service = useService(ImportConnectService);

const hasWork = connect.rows.some((row) => row.blocked === undefined && row.actions.length > 0);
const phase = ref<"preview" | "running" | "report">(connect.rows.length === 0 ? "report" : "preview");
const progress = ref({ done: 0, total: 0 });
const report = ref<ConnectReport | undefined>(undefined);

function reasonLabel(reason: ConnectSkipReason): string {
  return match(reason)
    .with("already-connected", () => m.bulk_add_skip_reason_already_connected())
    .with("filtered", () => m.bulk_add_skip_reason_filtered())
    .with("no-date", () => m.bulk_add_skip_reason_no_date())
    .with("invalid-date", () => m.bulk_add_skip_reason_invalid_date())
    .with("out-of-bounds", () => m.bulk_add_skip_reason_out_of_bounds())
    .with("not-on-journal-path", () => m.bulk_add_skip_reason_not_on_journal_path())
    .with("period-has-note", () => m.import_connect_skip_period_has_note())
    .with("matches-several-journals", () => m.import_connect_skip_several_journals())
    .exhaustive();
}

function skipCounts(row: ConnectRowPlan): { reason: ConnectSkipReason; count: number }[] {
  const counts = new Map<ConnectSkipReason, number>();
  for (const skip of row.skips) counts.set(skip.reason, (counts.get(skip.reason) ?? 0) + 1);
  return [...counts].map(([reason, count]) => ({ reason, count }));
}

function hasOffPathSkips(row: ConnectRowPlan): boolean {
  return row.skips.some((skip) => skip.reason === "not-on-journal-path");
}

function shelfLine(shelf: ShelfOutcome): string {
  return match(shelf)
    .with({ kind: "created" }, (value) => m.import_report_shelf_created({ name: value.name }))
    .with({ kind: "existing" }, (value) => m.import_report_shelf_existing({ name: value.name }))
    .with({ kind: "failed" }, (value) => m.import_report_shelf_failed({ name: value.name, message: value.message }))
    .exhaustive();
}

function rowLine(row: RowOutcome): string | undefined {
  return match(row)
    .with({ kind: "created" }, (value) => m.import_report_journal_created({ name: value.journalName }))
    .with({ kind: "existing" }, (value) => m.import_report_journal_existing({ name: value.journalName }))
    .with({ kind: "failed" }, (value) => m.import_report_journal_failed({ name: value.name, message: value.message }))
    .with({ kind: "skipped" }, (): undefined => undefined)
    .exhaustive();
}

function startupLine(startup: StartupOutcome): string | undefined {
  return match(startup)
    .with({ kind: "none" }, (): undefined => undefined)
    .with({ kind: "set" }, (value) => m.import_report_startup_set({ name: value.journalName }))
    .with({ kind: "kept" }, (value) => m.import_report_startup_kept({ name: value.journalName }))
    .exhaustive();
}

async function run(): Promise<void> {
  phase.value = "running";
  report.value = await service.apply(connect, (done, total) => {
    progress.value = { done, total };
  });
  phase.value = "report";
}
</script>

<template>
  <div>
    <template v-if="phase === 'preview'">
      <UiSettingRow v-for="row of connect.rows" :key="row.journalName" :name="row.journalName">
        <template #description>
          <div v-if="row.blocked">
            {{ m.import_connect_blocked({ reason: invertibilityWarningText(row.blocked) }) }}
          </div>
          <template v-else>
            <div>{{ m.import_connect_count({ count: row.actions.length }) }}</div>
            <div v-for="skip of skipCounts(row)" :key="skip.reason">
              {{ m.import_connect_skipped({ count: skip.count, reason: reasonLabel(skip.reason) }) }}
            </div>
            <div v-if="hasOffPathSkips(row)">{{ m.import_connect_by_title_hint() }}</div>
          </template>
        </template>
      </UiSettingRow>
      <UiSettingRow controls-only>
        <UiButton @click="phase = 'report'">{{ m.import_connect_skip() }}</UiButton>
        <UiButton cta :disabled="!hasWork" @click="run">{{ m.import_connect_run() }}</UiButton>
      </UiSettingRow>
    </template>

    <UiSettingRow v-else-if="phase === 'running'">
      <template #description>{{ m.bulk_add_progress(progress) }}</template>
    </UiSettingRow>

    <template v-else>
      <UiSettingRow heading :name="m.import_report_heading()" />
      <UiSettingRow>
        <template #description>
          <div>{{ outcome.snapshotWritten ? m.import_report_snapshot() : m.import_report_snapshot_failed() }}</div>
          <div v-if="outcome.weekStartApplied">{{ m.import_report_week_start() }}</div>
          <div v-for="shelf of outcome.shelves" :key="shelf.name">{{ shelfLine(shelf) }}</div>
          <template v-for="row of outcome.rows" :key="row.key">
            <div v-if="rowLine(row)">{{ rowLine(row) }}</div>
          </template>
          <div v-if="startupLine(outcome.startup)">{{ startupLine(outcome.startup) }}</div>
          <template v-for="row of report?.rows ?? []" :key="row.journalName">
            <div>{{ m.import_report_connected({ name: row.journalName, count: row.connected }) }}</div>
            <div v-for="failure of row.failed" :key="failure.path">
              {{ m.import_report_connect_failed({ path: failure.path, message: failure.message }) }}
            </div>
          </template>
        </template>
      </UiSettingRow>
      <UiSettingRow controls-only>
        <UiButton cta @click="api.submit()">{{ m.common_action_close() }}</UiButton>
      </UiSettingRow>
    </template>
  </div>
</template>
