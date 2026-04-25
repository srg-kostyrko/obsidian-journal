<script setup lang="ts">
import { moment } from "obsidian";
import {
  calculateDoy,
  date_from_string,
  detectCurrentPreset,
  doyToDayNumber,
  initialWeekSettings,
  restoreLocale,
  updateLocale,
  weekPresets,
} from "@/calendar";
import { usePlugin } from "@/composables/use-plugin";
import type { WeekPreset } from "@/types/calendar-ui.types";
import { computed, onMounted, ref } from "vue";
import ObsidianSetting from "../obsidian/ObsidianSetting.vue";
import ObsidianButton from "../obsidian/ObsidianButton.vue";
import ObsidianNumberInput from "../obsidian/ObsidianNumberInput.vue";
import ObsidianDropdown from "../obsidian/ObsidianDropdown.vue";
import { deepCopy } from "@/utils/misc";
import { updateWeeklyJournals } from "@/utils/journal";
import ObsidianIcon from "../obsidian/ObsidianIcon.vue";

const emit = defineEmits<{
  close: [];
}>();

const plugin = usePlugin();
const currentPreset = ref<WeekPreset>();
const firstDayOfWeek = ref<string>("0");
const firstDayOfYear = ref<number>(1);

const currentSavedPreset = detectCurrentPreset(plugin.calendarSettings);
const hasChanges = computed(
  () =>
    currentPreset.value &&
    (currentPreset.value.dow !== currentSavedPreset.dow ||
      currentPreset.value.doy !== currentSavedPreset.doy ||
      currentPreset.value.name !== currentSavedPreset.name),
);

onMounted(() => {
  usePreset(currentSavedPreset);
});

function usePreset(preset: WeekPreset) {
  currentPreset.value = deepCopy(preset);
  firstDayOfWeek.value = String(preset.dow);
  firstDayOfYear.value = doyToDayNumber(preset.dow, preset.doy);
}
function useCustomPreset() {
  if (!currentPreset.value) return;
  currentPreset.value.name = "custom";
}

async function update() {
  if (!currentPreset.value) return;

  const weeklyJournals = plugin.journals.filter((journal) => journal.type === "week");
  const notesToUpdate = new Map();
  for (const journal of weeklyJournals) {
    const notes = [];
    for (const [date_string, path] of plugin.index.getJournalIndex(journal.name)) {
      const date = date_from_string(date_string);
      notes.push({
        year: date.year(),
        weeks: date.week(),
        path,
      });
    }
    notesToUpdate.set(journal.name, notes);
  }

  if (currentPreset.value.name === "custom") {
    currentPreset.value.dow = Number.parseInt(firstDayOfWeek.value, 10);
    currentPreset.value.doy = calculateDoy(currentPreset.value.dow, firstDayOfYear.value);
  }
  const { dow, doy } = currentPreset.value;
  const localeDow = plugin.calendarSettings.global ? initialWeekSettings.dow : moment().localeData().firstDayOfWeek();
  const localeDoy = plugin.calendarSettings.global ? initialWeekSettings.doy : moment().localeData().firstDayOfYear();

  if (dow === localeDow && doy === localeDoy) {
    plugin.calendarSettings.dow = -1;
    restoreLocale(plugin.calendarSettings.global);
  } else {
    plugin.calendarSettings.dow = dow;
    plugin.calendarSettings.doy = doy;
    updateLocale(dow, doy, plugin.calendarSettings.global);
  }

  await updateWeeklyJournals(plugin, notesToUpdate);

  emit("close");
}
</script>

<template>
  <div v-if="currentPreset">
    <ObsidianSetting v-for="preset of weekPresets" :key="preset.name">
      <template #name>
        {{ preset.name }}
      </template>
      <template #description>
        <div class="whitespace">
          {{ preset.description }}
        </div>
        <div>Used in: {{ preset.used }}</div>
      </template>
      <div v-if="preset.name === currentSavedPreset.name">Currently used</div>
      <ObsidianIcon v-if="preset.name === currentPreset.name" name="lucide-check" />
      <ObsidianButton v-else @click="usePreset(preset)">Use</ObsidianButton>
    </ObsidianSetting>
    <ObsidianSetting name="Custom settings">
      <template #description>
        <div>
          Here you can define what day of week should be used<br />
          as first and how first week of year should be defined<br />
          if none of standard presets suits your needs.
        </div>
      </template>
      <ObsidianButton v-if="currentPreset.name !== 'custom'" @click="useCustomPreset()">Use</ObsidianButton>
    </ObsidianSetting>
    <template v-if="currentPreset.name === 'custom'">
      <ObsidianSetting name="Start week on" description="Which day to consider as first day of week.">
        <ObsidianDropdown v-model="firstDayOfWeek">
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
        name="First week of year"
        description="Define what date in January a week should contain to be considered first week of a year."
      >
        <ObsidianNumberInput v-model="firstDayOfYear" />
      </ObsidianSetting>
    </template>
    <ObsidianSetting v-if="hasChanges">
      <template #description>
        This will update all weekly notes to use current settings - week number of notes will be kept but dates will be
        updated.
      </template>
      <ObsidianButton cta @click="update">Update</ObsidianButton>
    </ObsidianSetting>
  </div>
</template>
