<script setup lang="ts">
import { computed, ref } from "vue";

import { Calendar } from "@/calendar/calendar";
import { detectCurrentPreset, type WeekPreset } from "@/calendar/presets";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModalService } from "@/infrastructure/host/modals";
import { SettingsService } from "@/settings";
import UiButton from "@/ui/UiButton.vue";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { calendarSlice } from "../slice";

import { weekPresetPickerModal } from "./modals";

type ActivePreset = "locale" | WeekPreset["id"] | "custom";

const settings = useService(SettingsService);
const calendar = useService(Calendar);
const modals = useModalService();
const slice = settings.getSlice(calendarSlice);
const expanded = ref(false);

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
  },
});

function change(): void {
  void modals.open(weekPresetPickerModal, { current: slice.state }).tap((value) => {
    slice.state = value;
  });
}
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded">
    <template #trigger>
      <span class="section-heading">
        <UiIcon name="calendar" />
        <span class="section-title">{{ m.common_label_calendar() }}</span>
      </span>
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
  </UiCollapsibleBlock>
</template>

<style scoped>
.section-heading {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2-2);
}
.section-title {
  font-weight: var(--font-semibold);
}
.rationale {
  margin-bottom: var(--size-2-2);
}
.preset-name {
  font-weight: var(--font-semibold);
  margin-bottom: var(--size-2-1);
}
.whitespace {
  white-space: pre-line;
}
.journal-hint {
  color: var(--text-warning);
}
</style>
