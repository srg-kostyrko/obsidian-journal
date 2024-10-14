<script setup lang="ts">
import { moment } from "obsidian";
import { computed } from "vue";
import { calendarSettings$, calendarViewSettings$, pluginSettings$ } from "../stores/settings.store";
import ObsidianSetting from "../components/obsidian/ObsidianSetting.vue";
import ObsidianDropdown from "../components/obsidian/ObsidianDropdown.vue";
import ObsidianNumberInput from "../components/obsidian/ObsidianNumberInput.vue";
import ObsidianToggle from "@/components/obsidian/ObsidianToggle.vue";
import { updateLocale } from "../calendar";
import JournalSettingsWithoutShelves from "./JournalSettingsWithoutShelves.vue";
import JournalSettingsWithShelves from "./JournalSettingsWithShelves.vue";

const emit = defineEmits<(event: "edit" | "orgamize", name: string) => void>();

const fow = moment().localeData().firstDayOfWeek();
const fowText = moment().localeData().weekdays()[fow];

const weekStart = computed({
  get() {
    return String(calendarSettings$.value.firstDayOfWeek);
  },
  set(value) {
    if (value !== "-1") {
      updateLocale(Number.parseInt(value, 10), calendarSettings$.value.firstWeekOfYear);
    }
    calendarSettings$.value.firstDayOfWeek = Number.parseInt(value, 10);
  },
});
const showFirstWeekOfYear = computed(() => calendarSettings$.value.firstDayOfWeek !== -1);
function changeFirstWeekOfYear(value: number): void {
  updateLocale(calendarSettings$.value.firstDayOfWeek, value);
  calendarSettings$.value.firstWeekOfYear = value;
}
</script>

<template>
  <ObsidianSetting name="Start week on" description="Which day to consider as first day of week.">
    <ObsidianDropdown v-model="weekStart">
      <option value="-1">Locale default ({{ fowText }})</option>
      <option value="0">Sunday</option>
      <option value="1">Monday</option>
      <option value="2">Tuesday</option>
      <option value="3">Wednesday</option>
      <option value="4">Thursday</option>
      <option value="5">Friday</option>
      <option value="6">Saturday</option>
    </ObsidianDropdown>
  </ObsidianSetting>
  <ObsidianSetting
    v-if="showFirstWeekOfYear"
    name="First week of year"
    description="Define what date in January a week should contain to be considered first week of a year."
  >
    <ObsidianNumberInput :model-value="calendarSettings$.firstWeekOfYear" @update:model-value="changeFirstWeekOfYear" />
  </ObsidianSetting>

  <ObsidianSetting name="Use shelves?">
    <ObsidianToggle v-model="pluginSettings$.useShelves" />
  </ObsidianSetting>

  <JournalSettingsWithShelves v-if="pluginSettings$.useShelves" @organize="emit('orgamize', $event)" />
  <JournalSettingsWithoutShelves v-else @edit="emit('edit', $event)" />

  <ObsidianSetting name="Calendar view" heading />
  <ObsidianSetting name="Add to">
    <ObsidianDropdown v-model="calendarViewSettings$.leaf">
      <option value="left">Left sidebar</option>
      <option value="right">Right sidebar</option>
    </ObsidianDropdown>
  </ObsidianSetting>
  <ObsidianSetting name="Show weeks">
    <ObsidianDropdown v-model="calendarViewSettings$.weeks">
      <option value="none">Don't show</option>
      <option value="left">Before weekdays</option>
      <option value="right">After weekdays</option>
    </ObsidianDropdown>
  </ObsidianSetting>
</template>
