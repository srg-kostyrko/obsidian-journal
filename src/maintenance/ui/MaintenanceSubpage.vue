<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { NoticeService } from "@/infrastructure/host";
import { SettingsService } from "@/settings";
import type { SubpageNav } from "@/settings";
import { SnapshotService, type SnapshotInfo } from "@/settings/snapshots/snapshot-service";
import UiBackLink from "@/ui/UiBackLink.vue";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { RepairService } from "../repair-service";
import { ScanService } from "../scan-service";

import type { CheckKey, Finding, RepairAction, ScanReport } from "../findings";

const { nav } = defineProps<{ nav: SubpageNav }>();

const snapshots = useService(SnapshotService);
const settings = useService(SettingsService);
const notices = useService(NoticeService);
const scanner = useService(ScanService);
const repairs = useService(RepairService);

const available = ref<SnapshotInfo[]>([]);
const listFailed = ref(false);
const restoring = ref(false);

const report = ref<ScanReport | undefined>(undefined);
const scanning = ref(false);

const safeActions = computed<RepairAction[]>(() =>
  (report.value?.findings ?? [])
    .filter((finding) => finding.repair.kind === "rewrite")
    .map((finding) => ({ path: finding.path, journalName: finding.journalName, repair: finding.repair })),
);

interface FindingGroup {
  readonly check: CheckKey;
  readonly journalName: string;
  readonly findings: Finding[];
}

const groups = computed<FindingGroup[]>(() => {
  const byKey = new Map<string, FindingGroup>();
  const findings = report.value?.findings ?? [];
  for (const finding of findings) {
    const key = `${finding.check}::${finding.journalName}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.findings.push(finding);
    else byKey.set(key, { check: finding.check, journalName: finding.journalName, findings: [finding] });
  }
  return [...byKey.values()];
});

async function refresh(): Promise<void> {
  const listed = await snapshots.list();
  listFailed.value = listed.isErr();
  available.value = listed.match({ ok: (value) => value, err: () => [] });
}

async function runScan(): Promise<void> {
  scanning.value = true;
  report.value = await scanner.scan();
  scanning.value = false;
}

async function applyAndRescan(actions: readonly RepairAction[]): Promise<void> {
  const log = await repairs.apply(actions);
  const entries = log.match({ ok: (value) => value, err: () => [] });
  const failed = entries.filter((entry) => entry.outcome.kind === "failed").length;
  notices.show(m.maintenance_repair_done({ repaired: entries.length - failed, failed }));
  await runScan();
}

function groupTitle(group: FindingGroup): string {
  switch (group.check) {
    case "rejected-anchor": {
      return m.maintenance_check_group_rejected({ journal: group.journalName });
    }
    case "stale-range": {
      return m.maintenance_check_group_stale({ journal: group.journalName });
    }
    case "duplicate-anchor": {
      const detail = group.findings.at(0)?.detail;
      const anchor = detail?.kind === "duplicate" ? detail.anchor : "";
      return m.maintenance_check_group_duplicate({ journal: group.journalName, anchor });
    }
    case "orphaned-claim": {
      return m.maintenance_check_group_orphaned({ journal: group.journalName });
    }
  }
}

function groupActions(group: FindingGroup): RepairAction[] {
  return group.findings
    .filter((finding) => finding.repair.kind === "rewrite")
    .map((finding) => ({ path: finding.path, journalName: finding.journalName, repair: finding.repair }));
}

function detailText(finding: Finding): string {
  const { path, detail } = finding;
  switch (detail.kind) {
    case "corroborated":
    case "date-only": {
      return m.maintenance_detail_moved({ path, from: detail.from, to: detail.to });
    }
    case "no-usable-date": {
      return m.maintenance_detail_no_usable_date({ path, to: detail.to });
    }
    case "path-overrides-date": {
      return m.maintenance_detail_path_overrides_date({
        path,
        pathAnchor: detail.pathAnchor,
        dateAnchor: detail.dateAnchor,
      });
    }
    case "unreadable": {
      return m.maintenance_detail_unreadable({ path });
    }
    case "zero-length-range": {
      return m.maintenance_detail_zero_length({ path });
    }
    case "start-mismatch": {
      return m.maintenance_detail_start_mismatch({
        path,
        storedStart: detail.storedStart,
        expectedStart: detail.expectedStart,
      });
    }
    case "duplicate": {
      return m.maintenance_detail_duplicate({ path, size: detail.size, mtime: detail.mtime });
    }
    case "orphaned": {
      return m.maintenance_detail_orphaned({ path });
    }
  }
}

function stripOf(finding: Finding): RepairAction {
  return { path: finding.path, journalName: finding.journalName, repair: { kind: "strip-claim" } };
}

async function keepOnly(group: FindingGroup, keeper: Finding): Promise<void> {
  const actions = group.findings.filter((finding) => finding.path !== keeper.path).map(stripOf);
  await applyAndRescan(actions);
}

async function restore(info: SnapshotInfo): Promise<void> {
  restoring.value = true;
  try {
    const contents = await snapshots.read(info.name);
    if (contents.isErr()) {
      notices.show(m.maintenance_snapshot_failed());
      return;
    }
    const replaced = await settings.replaceStoredData(contents.value);
    notices.show(
      replaced.isErr() ? m.maintenance_snapshot_failed() : m.maintenance_snapshot_restored({ takenAt: info.takenAt }),
    );
    report.value = undefined;
    await refresh();
    await runScan();
  } finally {
    restoring.value = false;
  }
}

onMounted(refresh);
onMounted(runScan);
</script>

<template>
  <div>
    <UiBackLink @click="nav.back()" />

    <UiSettingRow heading :name="m.maintenance_snapshots_heading()" />
    <UiSettingRow v-if="listFailed">
      <template #description>{{ m.maintenance_snapshots_load_failed() }}</template>
    </UiSettingRow>
    <UiSettingRow v-else-if="available.length === 0">
      <template #description>{{ m.maintenance_snapshots_empty() }}</template>
    </UiSettingRow>
    <UiSettingRow v-for="info of available" :key="info.name" :name="info.takenAt">
      <template #description>
        {{
          info.reason === "pre-restore"
            ? m.maintenance_snapshot_row_restore()
            : m.maintenance_snapshot_row({ version: info.fromVersion })
        }}
      </template>
      <UiButton :disabled="restoring" @click="restore(info)">{{ m.maintenance_snapshot_restore() }}</UiButton>
    </UiSettingRow>

    <UiSettingRow heading :name="m.maintenance_check_heading()" />
    <UiSettingRow>
      <template #description>{{ m.maintenance_check_config_note() }}</template>
    </UiSettingRow>
    <UiSettingRow v-if="scanning">
      <template #description>{{ m.maintenance_check_scanning() }}</template>
    </UiSettingRow>
    <template v-else-if="report">
      <UiSettingRow v-if="report.pendingMigration">
        <template #description>{{ m.maintenance_check_pending_migration() }}</template>
      </UiSettingRow>
      <UiSettingRow>
        <template #description>
          {{
            m.maintenance_check_completeness({
              analysed: report.analysed,
              unreadable: report.unreadable.length,
              unparsed: report.unparsed,
            })
          }}
        </template>
      </UiSettingRow>
      <UiSettingRow v-if="report.findings.length === 0">
        <template #description>{{ m.maintenance_check_clean() }}</template>
      </UiSettingRow>
      <template v-for="group of groups" :key="`${group.check}-${group.journalName}`">
        <UiSettingRow :name="groupTitle(group)">
          <UiButton v-if="groupActions(group).length > 0" @click="applyAndRescan(groupActions(group))">
            {{ m.maintenance_check_fix() }}
          </UiButton>
        </UiSettingRow>
        <UiSettingRow v-for="finding of group.findings" :key="finding.path">
          <template #description>{{ detailText(finding) }}</template>
          <UiButton v-if="group.check === 'duplicate-anchor'" @click="keepOnly(group, finding)">
            {{ m.maintenance_duplicate_keep() }}
          </UiButton>
          <UiButton v-else-if="group.check === 'orphaned-claim'" @click="applyAndRescan([stripOf(finding)])">
            {{ m.maintenance_orphan_clear() }}
          </UiButton>
        </UiSettingRow>
        <UiSettingRow v-if="group.check === 'orphaned-claim'">
          <template #description>{{ m.maintenance_orphan_reassign_hint() }}</template>
        </UiSettingRow>
      </template>
      <UiSettingRow v-for="entry of report.unreadable" :key="entry.path">
        <template #description>{{
          m.maintenance_unreadable_row({ path: entry.path, message: entry.message })
        }}</template>
      </UiSettingRow>
      <UiSettingRow controls-only>
        <UiButton :disabled="safeActions.length === 0" @click="applyAndRescan(safeActions)">
          {{ m.maintenance_check_fix_all() }}
        </UiButton>
      </UiSettingRow>
    </template>
  </div>
</template>
