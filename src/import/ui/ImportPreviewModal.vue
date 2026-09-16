<script setup lang="ts">
import { match } from "ts-pattern";
import { computed, reactive, ref } from "vue";

import { localeData } from "@/calendar";
import { formatConjunction, m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { sourceName } from "./source-names";

import type { ImportSelection } from "../import-service";
import type { ImportPlan, PlanRow, RowWarning } from "../planner";
import type { SourceId } from "../source";

interface ShelfGroup {
  readonly shelf: string | undefined;
  readonly rows: PlanRow[];
}

const { plan } = defineProps<{ plan: ImportPlan }>();
const api = useModal<ImportSelection>();

const names = reactive(new Map(plan.rows.map((row) => [row.key, row.name])));
const included = reactive(new Map(plan.rows.map((row) => [row.key, row.state.kind === "new"])));
const connected = reactive(new Map(plan.rows.map((row) => [row.key, row.state.kind !== "superseded"])));
const shelfNames = reactive(new Map(plan.shelves.map((shelf) => [shelf, shelf])));
const applyWeekStart = ref(plan.weekStart.kind === "offer" && plan.weekStart.tickedByDefault);
const setStartup = ref(plan.startup.kind === "set");

const startupRow = computed(() => {
  const startup = plan.startup;
  return startup.kind === "set" ? plan.rows.find((row) => row.key === startup.rowKey) : undefined;
});
const startupAvailable = computed(
  () =>
    startupRow.value !== undefined &&
    (startupRow.value.state.kind === "set-up" || (included.get(startupRow.value.key) ?? false)),
);
const weekStartMissed = computed(
  () => plan.weekStart.kind === "not-applicable" || (plan.weekStart.kind === "offer" && !applyWeekStart.value),
);
const notApplicableDay = computed(() =>
  plan.weekStart.kind === "not-applicable" ? (localeData().weekdays()[plan.weekStart.dow] ?? "") : "",
);

// Only a shelf a created journal actually lands on: the import creates a shelf from inside the rows
// loop, so one whose journals are all switched off is never created and its name cannot hold the
// import back.
const shelvesInUse = computed(() => {
  const inUse = new Set<string>();
  for (const row of plan.rows) {
    if (row.shelf !== undefined && creates(row)) inUse.add(row.shelf);
  }
  return inUse;
});
const canImport = computed(() => [...shelvesInUse.value].every((shelf) => shelfErrors(shelf).length === 0));
// A source can be read and contribute no journal at all — Calendar with its weekly note switched
// off still carries the week start — and a heading with nothing under it says only that the plugin
// was read.
const sections = computed(() =>
  plan.readings
    .map((reading) => ({ source: reading.source, groups: groupsOf(reading.source) }))
    .filter((section) => section.groups.length > 0),
);

function creates(row: PlanRow): boolean {
  return row.state.kind !== "set-up" && (included.get(row.key) ?? false);
}

function connects(row: PlanRow): boolean {
  return (row.state.kind === "set-up" || creates(row)) && (connected.get(row.key) ?? false);
}

function nameOf(row: PlanRow): string {
  return row.state.kind === "set-up" ? row.state.journalName : (names.get(row.key) ?? row.name);
}

function shelfNameOf(shelf: string): string {
  return shelfNames.get(shelf) ?? shelf;
}

function setShelfName(shelf: string | undefined, value: string): void {
  if (shelf === undefined) return;
  shelfNames.set(shelf, value);
}

function shelfErrors(shelf: string): string[] {
  if (!shelvesInUse.value.has(shelf)) return [];
  return shelfNameOf(shelf).trim() === "" ? [m.shelf_name_required_error()] : [];
}

// A group per run of consecutive rows sharing a shelf, so the shelf name is asked for once above the
// journals that land on it. Rows off any shelf group together under the source heading alone.
function groupsOf(source: SourceId): ShelfGroup[] {
  const groups: ShelfGroup[] = [];
  for (const row of plan.rows) {
    if (row.journal.source !== source) continue;
    const last = groups.at(-1);
    if (last !== undefined && last.shelf === row.shelf) {
      last.rows.push(row);
      continue;
    }
    groups.push({ shelf: row.shelf, rows: [row] });
  }
  return groups;
}

function stateText(row: PlanRow): string {
  return match(row.state)
    .with({ kind: "new" }, () => "")
    .with({ kind: "set-up" }, () => m.import_preview_row_set_up())
    .with({ kind: "superseded" }, (state) => m.import_preview_row_superseded({ source: sourceName(state.by) }))
    .exhaustive();
}

function warningText(warning: RowWarning): string {
  return match(warning)
    .with({ kind: "iso-week-under-custom-grid" }, () => m.import_preview_warning_iso_week())
    .with({ kind: "missing-template" }, (value) => m.import_preview_warning_missing_template({ path: value.path }))
    .exhaustive();
}

function confirm(): void {
  api.submit({
    rows: plan.rows.map((row) => ({
      key: row.key,
      name: nameOf(row),
      include: creates(row),
      connect: connects(row),
    })),
    shelves: plan.shelves.map((shelf) => ({ planned: shelf, name: shelfNameOf(shelf) })),
    applyWeekStart: plan.weekStart.kind === "offer" && applyWeekStart.value,
    setStartup: setStartup.value && startupAvailable.value,
  });
}
</script>

<template>
  <div>
    <UiSettingRow v-for="source of plan.unrecognised" :key="source">
      <template #description>{{ m.import_preview_unrecognised({ source: sourceName(source) }) }}</template>
    </UiSettingRow>

    <template v-for="section of sections" :key="section.source">
      <UiSettingRow heading :name="sourceName(section.source)" />

      <template v-for="(group, index) of section.groups" :key="index">
        <UiSettingRow v-if="group.shelf !== undefined" heading stacked :name="m.import_preview_shelf_label()">
          <template #description>
            <span v-for="error of shelfErrors(group.shelf)" :key="error" class="import-form-error">{{ error }}</span>
          </template>
          <UiTextInput
            :model-value="shelfNameOf(group.shelf)"
            :aria-label="m.import_preview_shelf_label()"
            @update:model-value="(value: string) => setShelfName(group.shelf, value)"
          />
        </UiSettingRow>

        <UiSettingRow
          v-for="row of group.rows"
          :key="row.key"
          stacked
          :class="{ 'import-shelved-row': group.shelf !== undefined }"
        >
          <template #name>
            <UiTextInput
              v-if="row.state.kind !== 'set-up'"
              :model-value="nameOf(row)"
              :aria-label="m.import_preview_name_label()"
              @update:model-value="(value: string) => names.set(row.key, value)"
            />
            <template v-else>{{ nameOf(row) }}</template>
          </template>
          <template #description>
            <div>
              {{ m.import_preview_row_layout({ folder: row.folder || m.common_vault_root(), format: row.dateFormat }) }}
            </div>
            <div v-if="row.journal.templates.length > 0">
              {{ m.import_preview_row_template({ path: formatConjunction(row.journal.templates) }) }}
            </div>
            <div v-if="stateText(row)">{{ stateText(row) }}</div>
            <div v-if="row.journal.period === 'week' && weekStartMissed" class="import-warning">
              {{ m.import_preview_warning_week_start() }}
            </div>
            <div v-for="(warning, warningIndex) of row.warnings" :key="warningIndex" class="import-warning">
              {{ warningText(warning) }}
            </div>
          </template>
          <!-- One flex child, because the stacked control area is deliberately nowrap: two toggles
               side by side would shrink and clip their labels instead of wrapping. -->
          <div class="import-row-toggles">
            <span v-if="row.state.kind !== 'set-up'" class="import-toggle">
              <UiToggle
                :model-value="included.get(row.key) ?? false"
                :tooltip="m.import_preview_include()"
                @update:model-value="(value: boolean | undefined) => included.set(row.key, value ?? false)"
              />
              {{ m.import_preview_include() }}
            </span>
            <span class="import-toggle">
              <UiToggle
                :model-value="connects(row)"
                :disabled="row.state.kind !== 'set-up' && !creates(row)"
                :tooltip="m.import_preview_connect()"
                @update:model-value="(value: boolean | undefined) => connected.set(row.key, value ?? false)"
              />
              {{ m.import_preview_connect() }}
            </span>
          </div>
        </UiSettingRow>
      </template>
    </template>

    <template v-if="plan.weekStart.kind !== 'unchanged' || plan.startup.kind !== 'none'">
      <UiSettingRow heading :name="m.import_preview_settings_heading()" />

      <UiSettingRow v-if="plan.weekStart.kind === 'offer'" :name="m.import_preview_week_start_label()">
        <template #description>{{ m.import_preview_week_start_description() }}</template>
        <UiToggle v-model="applyWeekStart" :tooltip="m.import_preview_week_start_label()" />
      </UiSettingRow>
      <UiSettingRow v-else-if="plan.weekStart.kind === 'not-applicable'" :name="m.import_preview_week_start_label()">
        <template #description>{{ m.import_preview_week_start_not_applicable({ day: notApplicableDay }) }}</template>
      </UiSettingRow>

      <UiSettingRow v-if="plan.startup.kind === 'set' && startupRow" :name="m.import_preview_startup_label()">
        <template #description>
          {{ m.import_preview_startup_description({ name: nameOf(startupRow) }) }}
        </template>
        <UiToggle v-model="setStartup" :disabled="!startupAvailable" :tooltip="m.import_preview_startup_label()" />
      </UiSettingRow>
      <UiSettingRow v-else-if="plan.startup.kind === 'kept'" :name="m.import_preview_startup_label()">
        <template #description>{{ m.import_preview_startup_kept({ journalName: plan.startup.journalName }) }}</template>
      </UiSettingRow>
    </template>

    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta :disabled="!canImport" @click="confirm">{{ m.import_preview_confirm() }}</UiButton>
    </UiSettingRow>
  </div>
</template>

<style scoped>
.import-warning {
  color: var(--text-warning);
}
.import-form-error {
  color: var(--text-error);
  display: block;
}
.import-row-toggles {
  display: flex;
  flex-wrap: wrap;
  gap: var(--size-4-2) var(--size-4-4);
  min-width: 0;
}
.import-shelved-row {
  /* One step in from the shelf row's label. Obsidian indents a heading row's own content by 16px,
     so the same margin here would leave the two flush rather than nested. */
  margin-inline-start: var(--size-4-8);
}
.import-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--size-4-2);
  color: var(--text-muted);
  font-size: var(--font-ui-small);
}
</style>
