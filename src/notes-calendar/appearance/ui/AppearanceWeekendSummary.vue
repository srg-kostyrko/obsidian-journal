<script setup lang="ts">
import { computed } from "vue";

import { activeLocale, Calendar, calendarDisplaySlice, resolveWeekend, weekendDayNames } from "@/calendar";
import { formatConjunction, m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { SettingsService } from "@/settings";
import type { SubpageNav } from "@/settings";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const { nav } = defineProps<{ nav: SubpageNav }>();

const display = useService(SettingsService).getSlice(calendarDisplaySlice);
const calendar = useService(Calendar);

const summary = computed(() => {
  const days = weekendDayNames(resolveWeekend(display.state.weekend, activeLocale()), calendar.weekdays());
  return m.calendar_appearance_weekend_summary({
    mode: days.length === 0 ? "none" : "some",
    days: formatConjunction(days),
  });
});
</script>

<template>
  <UiSettingRow :name="summary">
    <UiButton @click="nav.back()">{{ m.calendar_appearance_weekend_open_settings() }}</UiButton>
  </UiSettingRow>
</template>
