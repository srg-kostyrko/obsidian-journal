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

const { plan } = defineProps<{ plan: ImportPlan }>();
const api = useModal<ImportSelection>();

const names = reactive(new Map(plan.rows.map((row) => [row.key, row.name])));
const included = reactive(new Map(plan.rows.map((row) => [row.key, row.state.kind === "new"])));
const connected = reactive(new Map(plan.rows.map((row) => [row.key, row.state.kind !== "superseded"])));
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

function rowsOf(source: SourceId): PlanRow[] {
  return plan.rows.filter((row) => row.journal.source === source);
}

function stateText(row: PlanRow): string {
  return match(row.state)
    .with({ kind: "new" }, () => "")
    .with({ kind: "set-up" }, (state) => m.import_preview_row_set_up({ journalName: state.journalName }))
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
      name: names.get(row.key) ?? row.name,
      include: row.state.kind !== "set-up" && (included.get(row.key) ?? false),
      connect: connected.get(row.key) ?? false,
    })),
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

    <template v-for="reading of plan.readings" :key="reading.source">
      <UiSettingRow heading :name="sourceName(reading.source)" />
      <UiSettingRow v-for="row of rowsOf(reading.source)" :key="row.key" stacked>
        <template #name>
          <UiTextInput
            :model-value="names.get(row.key) ?? row.name"
            :disabled="row.state.kind === 'set-up'"
            :aria-label="m.import_preview_name_label()"
            @update:model-value="(value: string) => names.set(row.key, value)"
          />
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
          <div v-for="(warning, index) of row.warnings" :key="index" class="import-warning">
            {{ warningText(warning) }}
          </div>
        </template>
        <UiToggle
          v-if="row.state.kind !== 'set-up'"
          :model-value="included.get(row.key) ?? false"
          :tooltip="m.import_preview_include()"
          @update:model-value="(value: boolean | undefined) => included.set(row.key, value ?? false)"
        />
        <UiToggle
          :model-value="connected.get(row.key) ?? false"
          :tooltip="m.import_preview_connect()"
          @update:model-value="(value: boolean | undefined) => connected.set(row.key, value ?? false)"
        />
      </UiSettingRow>
    </template>

    <UiSettingRow v-if="plan.shelves.length > 0">
      <template #description>{{ m.import_preview_shelves({ names: formatConjunction(plan.shelves) }) }}</template>
    </UiSettingRow>

    <UiSettingRow v-if="plan.weekStart.kind === 'offer'" :name="m.import_preview_week_start_label()">
      <template #description>{{ m.import_preview_week_start_description() }}</template>
      <UiToggle v-model="applyWeekStart" :tooltip="m.import_preview_week_start_label()" />
    </UiSettingRow>
    <UiSettingRow v-else-if="plan.weekStart.kind === 'not-applicable'" :name="m.import_preview_week_start_label()">
      <template #description>{{ m.import_preview_week_start_not_applicable({ day: notApplicableDay }) }}</template>
    </UiSettingRow>

    <UiSettingRow v-if="plan.startup.kind === 'set' && startupRow" :name="m.import_preview_startup_label()">
      <template #description>
        {{ m.import_preview_startup_description({ name: names.get(startupRow.key) ?? startupRow.name }) }}
      </template>
      <UiToggle v-model="setStartup" :disabled="!startupAvailable" :tooltip="m.import_preview_startup_label()" />
    </UiSettingRow>
    <UiSettingRow v-else-if="plan.startup.kind === 'kept'" :name="m.import_preview_startup_label()">
      <template #description>{{ m.import_preview_startup_kept({ journalName: plan.startup.journalName }) }}</template>
    </UiSettingRow>

    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta @click="confirm">{{ m.import_preview_confirm() }}</UiButton>
    </UiSettingRow>
  </div>
</template>

<style scoped>
.import-warning {
  color: var(--text-warning);
}
</style>
