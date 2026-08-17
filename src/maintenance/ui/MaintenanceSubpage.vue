<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import { localMoment } from "@/calendar";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { NoticeService } from "@/infrastructure/host";
import { JournalsIndex } from "@/journals/journals-index";
import { SettingsService } from "@/settings";
import type { SubpageNav } from "@/settings";
import { SnapshotService, type SnapshotInfo } from "@/settings/snapshots/snapshot-service";
import UiBackLink from "@/ui/UiBackLink.vue";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { RepairService } from "../repair-service";
import { ScanService } from "../scan-service";

import type { CheckKey, Finding, RepairAction, ScanReport, UndecidableReason } from "../findings";

const { nav } = defineProps<{ nav: SubpageNav }>();

const snapshots = useService(SnapshotService);
const settings = useService(SettingsService);
const notices = useService(NoticeService);
const scanner = useService(ScanService);
const repairs = useService(RepairService);
const index = useService(JournalsIndex);

const available = ref<SnapshotInfo[]>([]);
const listFailed = ref(false);
const restoring = ref(false);

const report = ref<ScanReport | undefined>(undefined);
const scanning = ref(false);
const indexReady = ref(index.isReady());

const safeActions = computed<RepairAction[]>(() =>
  (report.value?.findings ?? [])
    .filter((finding) => finding.repair.kind === "rewrite")
    .map((finding) => ({ path: finding.path, journalName: finding.journalName, repair: finding.repair })),
);

// Findings are computed against the config live when the scan ran; a restore invalidates them,
// and the page says so above (maintenance_check_pending_migration / config_note).
const fixDisabled = computed(() => report.value?.pendingMigration ?? false);
// A note the scan could not read is invisible to the collision gate, so its anchor is absent
// from projected space entirely — "every rewrite whose projected target is claimed by exactly
// one note" cannot be verified while any note went unread.
const fixAllDisabled = computed(
  () => fixDisabled.value || safeActions.value.length === 0 || (report.value?.unreadable.length ?? 0) > 0,
);

interface FindingGroup {
  readonly key: string;
  readonly check: CheckKey;
  readonly journalName: string;
  readonly findings: Finding[];
}

// A journal can carry two independent duplicate-anchor collisions at once (different anchors,
// different note pairs), so the anchor must be part of the key — check + journalName alone would
// merge them into one group, and keepOnly would then strip claims from notes the user never chose.
function groupKeyOf(finding: Finding): string {
  const anchorPart = finding.detail.kind === "duplicate" ? finding.detail.anchor : "";
  return `${finding.check}::${finding.journalName}::${anchorPart}`;
}

const groups = computed<FindingGroup[]>(() => {
  const byKey = new Map<string, FindingGroup>();
  const findings = report.value?.findings ?? [];
  for (const finding of findings) {
    const key = groupKeyOf(finding);
    const bucket = byKey.get(key);
    if (bucket) bucket.findings.push(finding);
    else byKey.set(key, { key, check: finding.check, journalName: finding.journalName, findings: [finding] });
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
  indexReady.value = index.isReady();
  if (!indexReady.value) {
    await index.whenReady();
    indexReady.value = true;
  }
  // scanner.scan() awaits the same gate internally, so this second wait is a no-op by the time
  // it runs — the point of the one above is to flip indexReady while still showing the "scanning"
  // row, so the message can tell "still indexing" apart from "reading your notes".
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
      return m.maintenance_detail_duplicate({
        path,
        size: detail.size,
        mtime: localMoment(detail.mtime).format("YYYY-MM-DD HH:mm"),
      });
    }
    case "orphaned": {
      return m.maintenance_detail_orphaned({ path });
    }
  }
}

function reasonText(reason: UndecidableReason): string {
  switch (reason) {
    case "anchor-contested": {
      return m.maintenance_reason_anchor_contested();
    }
    case "path-and-date-disagree": {
      return m.maintenance_reason_path_and_date_disagree();
    }
    case "path-not-invertible": {
      return m.maintenance_reason_path_not_invertible();
    }
    case "needs-choice": {
      return m.maintenance_reason_needs_choice();
    }
  }
}

// The only row a repair.reason can explain: a corroborated/date-only finding withdrawn by the
// collision gate still shows a "→" move in its detail text with no button next to it, which
// otherwise reads as trivially fixable rather than blocked.
function rowText(finding: Finding): string {
  const detail = detailText(finding);
  return finding.repair.kind === "undecidable" ? `${detail} ${reasonText(finding.repair.reason)}` : detail;
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
      <template #description>
        {{ indexReady ? m.maintenance_check_scanning() : m.maintenance_check_indexing() }}
      </template>
    </UiSettingRow>
    <template v-else-if="report">
      <UiSettingRow v-if="report.pendingMigration">
        <template #description>{{ m.maintenance_check_pending_migration() }}</template>
      </UiSettingRow>
      <UiSettingRow>
        <template #description>
          {{
            m.maintenance_check_completeness({
              analyzed: report.analyzed,
              unreadable: report.unreadable.length,
              unparsed: report.unparsed,
            })
          }}
        </template>
      </UiSettingRow>
      <UiSettingRow v-if="report.findings.length === 0">
        <template #description>{{ m.maintenance_check_clean() }}</template>
      </UiSettingRow>
      <template v-for="group of groups" :key="group.key">
        <UiSettingRow :name="groupTitle(group)">
          <UiButton
            v-if="groupActions(group).length > 0"
            :disabled="fixDisabled"
            @click="applyAndRescan(groupActions(group))"
          >
            {{ m.maintenance_check_fix() }}
          </UiButton>
        </UiSettingRow>
        <UiSettingRow v-for="finding of group.findings" :key="finding.path">
          <template #description>{{ rowText(finding) }}</template>
          <UiButton v-if="group.check === 'duplicate-anchor'" :disabled="fixDisabled" @click="keepOnly(group, finding)">
            {{ m.maintenance_duplicate_keep() }}
          </UiButton>
          <UiButton
            v-else-if="group.check === 'orphaned-claim'"
            :disabled="fixDisabled"
            @click="applyAndRescan([stripOf(finding)])"
          >
            {{ m.maintenance_orphan_clear() }}
          </UiButton>
        </UiSettingRow>
        <UiSettingRow v-if="group.check === 'orphaned-claim'">
          <template #description>{{ m.maintenance_orphan_reassign_hint() }}</template>
        </UiSettingRow>
      </template>
      <UiSettingRow v-for="entry of report.unreadable" :key="entry.path">
        <template #description>
          {{ m.maintenance_unreadable_row({ path: entry.path, message: entry.message }) }}
        </template>
      </UiSettingRow>
      <UiSettingRow controls-only>
        <UiButton :disabled="fixAllDisabled" @click="applyAndRescan(safeActions)">
          {{ m.maintenance_check_fix_all() }}
        </UiButton>
      </UiSettingRow>
    </template>
  </div>
</template>
