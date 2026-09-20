<script setup lang="ts">
import { match } from "ts-pattern";
import { computed, onMounted, ref } from "vue";

import { localMoment } from "@/calendar";
import { formatConjunction, m } from "@/i18n";
import ImportFromPluginsSection from "@/import/ui/ImportFromPluginsSection.vue";
import { useService } from "@/infrastructure/di";
import { NoticeService } from "@/infrastructure/host";
import { JournalsIndex } from "@/journals/journals-index";
import { SettingsService, SettingsTooNewError } from "@/settings";
import type { SubpageNav } from "@/settings";
import { SnapshotService, type SnapshotInfo } from "@/settings/snapshots/snapshot-service";
import { icons } from "@/ui/icons";
import { manual } from "@/ui/manual";
import UiBackLink from "@/ui/UiBackLink.vue";
import UiButton from "@/ui/UiButton.vue";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { RepairService } from "../repair-service";
import { ScanService } from "../scan-service";

import type {
  AmbiguousNoteFinding,
  AttachCandidate,
  ClaimFinding,
  Finding,
  RepairAction,
  ScanReport,
  UndecidableReason,
} from "../findings";

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

function rewritesOf(findings: readonly Finding[]): RepairAction[] {
  return findings.flatMap((finding) =>
    finding.check !== "ambiguous-note" && finding.repair.kind === "rewrite"
      ? [{ path: finding.path, journalName: finding.journalName, repair: finding.repair }]
      : [],
  );
}

const safeActions = computed<RepairAction[]>(() => rewritesOf(report.value?.findings ?? []));

// Findings are computed against the config live when the scan ran; a restore invalidates them,
// and the page says so above (maintenance_check_pending_migration / config_note).
const fixDisabled = computed(() => report.value?.pendingMigration ?? false);
// A note the scan could not read is invisible to the collision gate, so its anchor is absent
// from projected space entirely — "every rewrite whose projected target is claimed by exactly
// one note" cannot be verified while any note went unread.
const fixAllDisabled = computed(
  () => fixDisabled.value || safeActions.value.length === 0 || (report.value?.unreadable.length ?? 0) > 0,
);

type FindingGroup =
  | { readonly key: string; readonly kind: "claim"; readonly head: ClaimFinding; readonly findings: ClaimFinding[] }
  | {
      readonly key: string;
      readonly kind: "ambiguous";
      readonly head: AmbiguousNoteFinding;
      readonly findings: AmbiguousNoteFinding[];
    };

// A journal can carry two independent duplicate-anchor collisions at once (different anchors,
// different note pairs), so the anchor must be part of the key — check + journalName alone would
// merge them into one group, and keepOnly would then strip claims from notes the user never chose.
function claimKeyOf(finding: ClaimFinding): string {
  const anchorPart = finding.detail.kind === "duplicate" ? finding.detail.anchor : "";
  return `${finding.check}::${finding.journalName}::${anchorPart}`;
}

const groups = computed<FindingGroup[]>(() => {
  const byKey = new Map<string, FindingGroup>();
  const findings = report.value?.findings ?? [];
  for (const finding of findings) {
    if (finding.check === "ambiguous-note") {
      const key = JSON.stringify([finding.check, ...finding.candidates.map((candidate) => candidate.journalName)]);
      const bucket = byKey.get(key);
      if (bucket?.kind === "ambiguous") bucket.findings.push(finding);
      else byKey.set(key, { key, kind: "ambiguous", head: finding, findings: [finding] });
      continue;
    }
    const key = claimKeyOf(finding);
    const bucket = byKey.get(key);
    if (bucket?.kind === "claim") bucket.findings.push(finding);
    else byKey.set(key, { key, kind: "claim", head: finding, findings: [finding] });
  }
  return [...byKey.values()];
});

function snapshotLabel(info: SnapshotInfo): string {
  return match(info.reason)
    .with("migration", () => m.maintenance_snapshot_row({ version: info.fromVersion }))
    .with("pre-restore", () => m.maintenance_snapshot_row_restore())
    .with("pre-import", () => m.maintenance_snapshot_row_import())
    .with("pre-downgrade", () => m.maintenance_snapshot_row_downgrade())
    .exhaustive();
}

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
  if (group.kind === "ambiguous") {
    const names = group.head.candidates.map((candidate) => candidate.journalName);
    return m.maintenance_check_group_ambiguous({ journals: formatConjunction(names) });
  }
  const { journalName: journal, detail } = group.head;
  switch (group.head.check) {
    case "rejected-anchor": {
      return m.maintenance_check_group_rejected({ journal });
    }
    case "stale-range": {
      return m.maintenance_check_group_stale({ journal });
    }
    case "duplicate-anchor": {
      const anchor = detail.kind === "duplicate" ? detail.anchor : "";
      return m.maintenance_check_group_duplicate({ journal, anchor });
    }
    case "orphaned-claim": {
      return m.maintenance_check_group_orphaned({ journal });
    }
    case "orphaned-type": {
      return m.maintenance_check_group_orphaned_type({ journal });
    }
  }
}

function groupActions(group: FindingGroup): RepairAction[] {
  return rewritesOf(group.findings);
}

function detailText(finding: Finding): string {
  if (finding.check === "ambiguous-note") return m.maintenance_detail_ambiguous({ path: finding.path });
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
    case "orphaned-type": {
      return m.maintenance_detail_orphaned_type({ path, typeName: detail.typeName });
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

// A group's Fix button covers only the rows it can rewrite, which is routinely fewer than the
// rows on screen — a rejected-anchor group mixes repairable notes with a path/date disagreement
// we refuse to guess at. Naming the count stops the button promising the whole group.
function willFix(finding: Finding): boolean {
  return finding.repair.kind === "rewrite";
}

// Why a row is being left alone, rendered under it rather than appended to the detail sentence
// so the two read as separate facts.
function rowReason(finding: Finding): string | undefined {
  return finding.repair.kind === "undecidable" ? reasonText(finding.repair.reason) : undefined;
}

const collapsed = ref(new Set<string>());

function setExpanded(key: string, expanded: boolean | undefined): void {
  const next = new Set(collapsed.value);
  if (expanded) next.delete(key);
  else next.add(key);
  collapsed.value = next;
}

function stripOf(finding: ClaimFinding): RepairAction {
  return { path: finding.path, journalName: finding.journalName, repair: { kind: "strip-claim" } };
}

async function keepOnly(group: FindingGroup, keeper: Finding): Promise<void> {
  if (group.kind !== "claim") return;
  const actions = group.findings.filter((finding) => finding.path !== keeper.path).map(stripOf);
  await applyAndRescan(actions);
}

function attachableOf(finding: Finding): AttachCandidate[] {
  return finding.check === "ambiguous-note" ? finding.candidates.filter((candidate) => !candidate.occupied) : [];
}

// An occupied candidate gets no button, and without this line nothing would say why.
function occupiedText(finding: Finding): string | undefined {
  if (finding.check !== "ambiguous-note") return undefined;
  const occupied = finding.candidates.filter((candidate) => candidate.occupied);
  if (occupied.length === 0) return undefined;
  return m.maintenance_ambiguous_occupied({
    journals: formatConjunction(occupied.map((candidate) => candidate.journalName)),
  });
}

async function attachTo(finding: Finding, candidate: AttachCandidate): Promise<void> {
  await applyAndRescan([
    { path: finding.path, journalName: candidate.journalName, repair: { kind: "attach", anchor: candidate.anchor } },
  ]);
}

async function restoreOutcome(contents: Record<string, unknown>, info: SnapshotInfo): Promise<string> {
  const locked = settings.lockedByNewerVersion.value;
  const replaced = await settings.replaceStoredData(contents);
  if (replaced.isOk()) return m.maintenance_snapshot_restored({ takenAt: info.takenAt });
  if (replaced.error instanceof SettingsTooNewError) {
    return locked ? m.maintenance_snapshot_restore_locked() : m.maintenance_snapshot_too_new();
  }
  return m.maintenance_snapshot_failed();
}

async function restore(info: SnapshotInfo): Promise<void> {
  restoring.value = true;
  try {
    const contents = await snapshots.read(info.name);
    if (contents.isErr()) {
      notices.show(m.maintenance_snapshot_failed());
      return;
    }
    // "It may be damaged" is wrong for the two version failures, and both have a different thing
    // for the user to do: one waits for a restart, the other cannot be restored at all.
    notices.show(await restoreOutcome(contents.value, info));
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

    <UiSettingRow heading :name="m.maintenance_snapshots_heading()" :help="manual.troubleshooting.snapshots" />
    <UiSettingRow v-if="listFailed">
      <template #description>{{ m.maintenance_snapshots_load_failed() }}</template>
    </UiSettingRow>
    <UiSettingRow v-else-if="available.length === 0">
      <template #description>{{ m.maintenance_snapshots_empty() }}</template>
    </UiSettingRow>
    <UiSettingRow v-for="info of available" :key="info.name" :name="info.takenAt">
      <template #description>{{ snapshotLabel(info) }}</template>
      <UiButton :disabled="restoring" @click="restore(info)">{{ m.maintenance_snapshot_restore() }}</UiButton>
    </UiSettingRow>

    <ImportFromPluginsSection />

    <UiSettingRow heading :name="m.maintenance_check_heading()" :help="manual.troubleshooting.vaultCheck" />
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
      <UiCollapsibleBlock
        v-for="group of groups"
        :key="group.key"
        :expanded="!collapsed.has(group.key)"
        @update:expanded="setExpanded(group.key, $event)"
      >
        <template #trigger>{{ groupTitle(group) }}</template>
        <template #controls>
          <UiButton
            v-if="groupActions(group).length > 0"
            :disabled="fixDisabled"
            @click="applyAndRescan(groupActions(group))"
          >
            {{ m.maintenance_check_fix_count({ count: groupActions(group).length }) }}
          </UiButton>
        </template>

        <div v-for="finding of group.findings" :key="finding.path" class="maintenance-finding">
          <UiIcon
            class="maintenance-finding-mark"
            :class="willFix(finding) ? 'is-will-fix' : 'is-needs-you'"
            :name="willFix(finding) ? icons.status.willFix : icons.status.needsYou"
            :aria-label="willFix(finding) ? m.maintenance_check_row_will_fix() : m.maintenance_check_row_needs_you()"
          />
          <div class="maintenance-finding-body">
            <div class="maintenance-finding-detail">{{ detailText(finding) }}</div>
            <div v-if="rowReason(finding)" class="maintenance-finding-reason">{{ rowReason(finding) }}</div>
            <div v-if="occupiedText(finding)" class="maintenance-finding-reason">{{ occupiedText(finding) }}</div>
          </div>
          <UiButton
            v-if="finding.check === 'duplicate-anchor'"
            :disabled="fixDisabled"
            @click="keepOnly(group, finding)"
          >
            {{ m.maintenance_duplicate_keep() }}
          </UiButton>
          <UiButton
            v-else-if="finding.check === 'orphaned-claim' || finding.check === 'orphaned-type'"
            :disabled="fixDisabled"
            @click="applyAndRescan([stripOf(finding)])"
          >
            {{ m.maintenance_orphan_clear() }}
          </UiButton>
          <UiButton
            v-for="candidate of attachableOf(finding)"
            :key="candidate.journalName"
            :disabled="fixDisabled"
            @click="attachTo(finding, candidate)"
          >
            {{ m.maintenance_ambiguous_connect({ journal: candidate.journalName }) }}
          </UiButton>
        </div>
        <div v-if="group.head.check === 'orphaned-claim'" class="maintenance-finding-reason">
          {{ m.maintenance_orphan_reassign_hint() }}
        </div>
      </UiCollapsibleBlock>
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

<style scoped>
.maintenance-finding {
  display: flex;
  align-items: flex-start;
  gap: var(--size-4-2);
  padding: var(--size-2-3) 0;
  border-bottom: 1px solid var(--background-modifier-border);
}
.maintenance-finding:last-of-type {
  border-bottom: none;
}
/* Aligns the mark with the first line of the detail rather than the centre of a wrapped row. */
.maintenance-finding-mark {
  display: flex;
  flex: none;
  padding-top: 2px;
}
.maintenance-finding-mark.is-will-fix {
  color: var(--color-green);
}
.maintenance-finding-mark.is-needs-you {
  color: var(--color-yellow);
}
.maintenance-finding-body {
  flex-grow: 1;
  min-width: 0;
}
.maintenance-finding-detail {
  font-size: var(--font-ui-small);
}
.maintenance-finding-reason {
  font-size: var(--font-ui-smaller);
  color: var(--text-muted);
  margin-top: var(--size-2-1);
}
</style>
