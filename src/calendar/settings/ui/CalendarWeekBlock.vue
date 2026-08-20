<script setup lang="ts">
import { computed, ref } from "vue";

import { Calendar } from "@/calendar/calendar";
import { detectCurrentPreset, type WeekPreset } from "@/calendar/presets";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModalService } from "@/infrastructure/host/modals";
import { ReloadHintService, SettingsService } from "@/settings";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { calendarDisplaySlice, type WeekPlacement } from "../display-slice";
import { calendarSlice, type CalendarSliceState } from "../slice";
import { WeekPresetApplierToken } from "../week-preset-applier";

import { weekPresetPickerModal } from "./modals";

type ActivePreset = "locale" | WeekPreset["id"] | "custom";

const settings = useService(SettingsService);
const calendar = useService(Calendar);
const modals = useModalService();
const reloadHint = useService(ReloadHintService);
const applyPreset = useService(WeekPresetApplierToken);
const slice = settings.getSlice(calendarSlice);
const displaySlice = settings.getSlice(calendarDisplaySlice);
const expanded = ref(false);

function setWeekPlacement(weekPlacement: WeekPlacement): void {
  displaySlice.state = { ...displaySlice.state, weekPlacement };
}

const timelineNavigation = computed({
  get: () => displaySlice.state.timelineNavigation,
  set: (timelineNavigation: boolean) => {
    displaySlice.state = { ...displaySlice.state, timelineNavigation };
  },
});

const activePreset = computed<ActivePreset>(() => {
  if (slice.state.mode === "locale") return "locale";
  const detected = detectCurrentPreset({ dow: slice.state.dow, doy: slice.state.doy });
  return detected === "custom" ? "custom" : detected.id;
});

const activeDescription = computed(() => {
  const preset = activePreset.value;
  if (preset === "custom" && slice.state.mode === "custom") {
    const { dow, doy } = slice.state;
    return m.calendar_preset_custom_summary({
      dayName: calendar.weekdays()[dow] ?? "",
      firstDayOfYear: 7 + dow - doy,
    });
  }
  return m.calendar_preset_description({ preset });
});

const globalRef = computed({
  get: () => (slice.state.mode === "custom" ? slice.state.global : false),
  set: (v: boolean) => {
    if (slice.state.mode !== "custom") return;
    slice.state = { ...slice.state, global: v };
    reloadHint.request();
  },
});

// The global week patch rewires moment's locale at boot, so any change that turns
// it on, off, or reshapes it while on only fully applies after a reload.
function touchesGlobalPatch(before: CalendarSliceState, after: CalendarSliceState): boolean {
  if (JSON.stringify(before) === JSON.stringify(after)) return false;
  const globalOn = (s: CalendarSliceState): boolean => s.mode === "custom" && s.global;
  return globalOn(before) || globalOn(after);
}

function change(): void {
  void modals.open(weekPresetPickerModal, { current: slice.state }).tap((value) => {
    if (touchesGlobalPatch(slice.state, value)) reloadHint.request();
    // The applier owns the slice write: the new preset and the notes re-anchored onto it have
    // to move together, or the notes drop out of the index.
    void applyPreset.apply(value);
  });
}
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded">
    <template #trigger>
      <UiIconedRow :icon="icons.section.calendar">{{ m.common_label_calendar() }}</UiIconedRow>
    </template>
    <UiSettingRow heading :name="m.common_week_configuration()">
      <template #description>
        <div class="rationale">{{ m.calendar_week_config_description() }}</div>
        <div class="preset-name">{{ m.calendar_preset_name({ preset: activePreset }) }}</div>
        <div class="whitespace">{{ activeDescription }}</div>
      </template>
      <UiButton @click="change">{{ m.calendar_week_config_change() }}</UiButton>
    </UiSettingRow>
    <UiSettingRow v-if="slice.state.mode === 'custom'" :name="m.calendar_apply_globally_title()">
      <template #description>
        {{ m.calendar_apply_globally_desc() }}
        <div class="journal-hint">{{ m.calendar_apply_globally_restart_hint() }}</div>
      </template>
      <UiToggle v-model="globalRef" />
    </UiSettingRow>
    <UiSettingRow :name="m.calendar_week_placement_label()">
      <template #description>{{ m.calendar_week_placement_description() }}</template>
      <UiDropdown
        :model-value="displaySlice.state.weekPlacement"
        @update:model-value="(v) => setWeekPlacement(v as WeekPlacement)"
      >
        <option value="none">{{ m.view_block_config_weeks_none() }}</option>
        <option value="left">{{ m.view_block_config_weeks_left() }}</option>
        <option value="right">{{ m.view_block_config_weeks_right() }}</option>
      </UiDropdown>
    </UiSettingRow>
    <UiSettingRow :name="m.calendar_timeline_navigation_label()">
      <template #description>{{ m.calendar_timeline_navigation_description() }}</template>
      <UiToggle v-model="timelineNavigation" />
    </UiSettingRow>
  </UiCollapsibleBlock>
</template>

<style scoped>
.rationale {
  margin-bottom: var(--size-2-2);
}
.preset-name {
  font-weight: var(--font-semibold);
  margin-bottom: var(--size-2-1);
}
.whitespace {
  white-space: pre-wrap;
}
.journal-hint {
  color: var(--text-warning);
}
</style>
