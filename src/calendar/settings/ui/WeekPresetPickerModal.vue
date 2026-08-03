<script setup lang="ts">
import { computed, ref } from "vue";

import { Calendar } from "@/calendar";
import { detectCurrentPreset, weekPresets, type WeekPreset } from "@/calendar/presets";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModal } from "@/infrastructure/host/modals";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import type { CalendarSliceState } from "../slice";

const props = defineProps<{ current: CalendarSliceState }>();
const api = useModal<CalendarSliceState>();

type LocalChoice = "locale" | WeekPreset["id"] | "custom";

function initialChoice(): LocalChoice {
  if (props.current.mode === "locale") return "locale";
  const detected = detectCurrentPreset({ dow: props.current.dow, doy: props.current.doy });
  return detected === "custom" ? "custom" : detected.id;
}

const calendar = useService(Calendar);
const savedChoice: LocalChoice = initialChoice();
const localChoice = ref<LocalChoice>(savedChoice);
// Seed the custom fields from the effective week so opening Custom starts from what the user
// currently has (their locale's week when in locale mode), not a hardcoded Monday/4.
const effectiveWeek =
  props.current.mode === "custom" ? { dow: props.current.dow, doy: props.current.doy } : calendar.localeWeek();
const customDow = ref<string>(String(effectiveWeek.dow));
const customFirstDay = ref<number>(7 + effectiveWeek.dow - effectiveWeek.doy);
const stagedGlobal = props.current.mode === "custom" ? props.current.global : false;

const dowOptions = computed(() => calendar.weekdays().map((label, dow) => ({ value: String(dow), label })));

function pickLocale(): void {
  localChoice.value = "locale";
}

function pickPreset(preset: WeekPreset): void {
  localChoice.value = preset.id;
}

function pickCustom(): void {
  localChoice.value = "custom";
}

function update(): void {
  if (localChoice.value === "locale") {
    api.submit({ mode: "locale" });
    return;
  }
  if (localChoice.value === "custom") {
    const dow = Number.parseInt(customDow.value, 10);
    const firstDay = Math.min(7, Math.max(1, Math.round(customFirstDay.value)));
    const doy = 7 + dow - firstDay;
    api.submit({ mode: "custom", dow, doy, global: stagedGlobal });
    return;
  }
  const preset = weekPresets.find((p) => p.id === localChoice.value);
  if (!preset) {
    api.cancel();
    return;
  }
  api.submit({ mode: "custom", dow: preset.dow, doy: preset.doy, global: stagedGlobal });
}

function presetUsed(preset: WeekPreset): string {
  if (preset.id === "iso-8601") return m.calendar_preset_iso_used();
  if (preset.id === "western") return m.calendar_preset_western_used();
  return m.calendar_preset_middle_eastern_used();
}
</script>

<template>
  <div>
    <UiSettingRow :name="m.calendar_preset_name({ preset: 'locale' })">
      <template #description>{{ m.calendar_preset_description({ preset: "locale" }) }}</template>
      <span v-if="savedChoice === 'locale'">{{ m.calendar_picker_in_use_marker() }}</span>
      <UiIcon v-if="localChoice === 'locale'" :name="icons.action.check" />
      <UiButton v-else @click="pickLocale">{{ m.calendar_picker_use_action() }}</UiButton>
    </UiSettingRow>

    <UiSettingRow v-for="preset in weekPresets" :key="preset.id" :name="m.calendar_preset_name({ preset: preset.id })">
      <template #description>
        <div class="whitespace">{{ m.calendar_preset_description({ preset: preset.id }) }}</div>
        <div>{{ presetUsed(preset) }}</div>
      </template>
      <span v-if="savedChoice === preset.id">{{ m.calendar_picker_in_use_marker() }}</span>
      <UiIcon v-if="localChoice === preset.id" :name="icons.action.check" />
      <UiButton v-else @click="pickPreset(preset)">{{ m.calendar_picker_use_action() }}</UiButton>
    </UiSettingRow>

    <UiSettingRow :name="m.calendar_preset_name({ preset: 'custom' })">
      <template #description>{{ m.calendar_preset_description({ preset: "custom" }) }}</template>
      <span v-if="savedChoice === 'custom'">{{ m.calendar_picker_in_use_marker() }}</span>
      <UiIcon v-if="localChoice === 'custom'" :name="icons.action.check" />
      <UiButton v-else @click="pickCustom">{{ m.calendar_picker_use_action() }}</UiButton>
    </UiSettingRow>

    <template v-if="localChoice === 'custom'">
      <UiSettingRow :name="m.calendar_picker_start_week_on()">
        <template #description>{{ m.calendar_picker_start_week_on_desc() }}</template>
        <UiDropdown v-model="customDow">
          <option v-for="opt in dowOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </UiDropdown>
      </UiSettingRow>
      <UiSettingRow :name="m.calendar_picker_first_week_label()">
        <template #description>{{ m.calendar_picker_first_week_desc() }}</template>
        <UiNumberInput v-model="customFirstDay" :min="1" :max="7" />
      </UiSettingRow>
    </template>

    <UiSettingRow>
      <template #description>{{ m.calendar_picker_reanchor_hint() }}</template>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta @click="update">{{ m.calendar_picker_update_action() }}</UiButton>
    </UiSettingRow>
  </div>
</template>

<style scoped>
.whitespace {
  white-space: pre-wrap;
}
</style>
