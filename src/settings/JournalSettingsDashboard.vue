<script setup lang="ts">
import { moment } from "obsidian";
import { computed } from "vue";
import ObsidianSetting from "../components/obsidian/ObsidianSetting.vue";
import ObsidianDropdown from "../components/obsidian/ObsidianDropdown.vue";
import ObsidianNumberInput from "../components/obsidian/ObsidianNumberInput.vue";
import ObsidianToggle from "@/components/obsidian/ObsidianToggle.vue";
import { restoreLocale, updateLocale } from "../calendar";
import JournalSettingsWithoutShelves from "./JournalSettingsWithoutShelves.vue";
import JournalSettingsWithShelves from "./JournalSettingsWithShelves.vue";
import { usePlugin } from "@/composables/use-plugin";

const emit = defineEmits<(event: "edit" | "organize" | "bulk-add", name: string) => void>();

const plugin = usePlugin();

const fow = moment().localeData().firstDayOfWeek();
const fowText = moment().localeData().weekdays()[fow];

const weekStart = computed({
  get() {
    return String(plugin.calendar.firstDayOfWeek);
  },
  set(value) {
    if (value === "-1") {
      restoreLocale();
    } else {
      updateLocale(Number.parseInt(value, 10), plugin.calendar.firstWeekOfYear);
    }
    plugin.calendar.firstDayOfWeek = Number.parseInt(value, 10);
  },
});
const showFirstWeekOfYear = computed(() => plugin.calendar.firstDayOfWeek !== -1);
function changeFirstWeekOfYear(value: number): void {
  updateLocale(plugin.calendar.firstDayOfWeek, value);
  plugin.calendar.firstWeekOfYear = value;
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
    <ObsidianNumberInput :model-value="plugin.calendar.firstWeekOfYear" @update:model-value="changeFirstWeekOfYear" />
  </ObsidianSetting>

  <ObsidianSetting name="Use shelves?">
    <ObsidianToggle v-model="plugin.usesShelves" />
  </ObsidianSetting>

  <JournalSettingsWithShelves
    v-if="plugin.usesShelves"
    @organize="emit('organize', $event)"
    @edit="emit('edit', $event)"
    @bulk-add="emit('bulk-add', $event)"
  />
  <JournalSettingsWithoutShelves v-else @edit="emit('edit', $event)" />

  <ObsidianSetting name="Calendar view" heading />
  <ObsidianSetting name="Add to">
    <ObsidianDropdown v-model="plugin.calendarView.leaf">
      <option value="left">Left sidebar</option>
      <option value="right">Right sidebar</option>
    </ObsidianDropdown>
  </ObsidianSetting>
  <ObsidianSetting name="Show weeks">
    <ObsidianDropdown v-model="plugin.calendarView.weeks">
      <option value="none">Don't show</option>
      <option value="left">Before weekdays</option>
      <option value="right">After weekdays</option>
    </ObsidianDropdown>
  </ObsidianSetting>
  <ObsidianSetting name="Today button">
    <ObsidianDropdown v-model="plugin.calendarView.todayMode">
      <option value="create">Creates today's note if doesn't exist</option>
      <option value="navigate">Opens today's note if it exists</option>
      <option value="switch_date">Just switch calendar view to current month</option>
    </ObsidianDropdown>
  </ObsidianSetting>
</template>
