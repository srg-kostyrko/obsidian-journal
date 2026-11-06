<script setup lang="ts">
import CalendarBlockConfigFields from "../../ui/CalendarBlockConfigFields.vue";

import type { WeekCalendarConfig, WeekCalendarConfigChange } from "../week-calendar-block";

const props = defineProps<{
  config: WeekCalendarConfig;
  onChange: WeekCalendarConfigChange;
}>();

const update = (patch: Partial<WeekCalendarConfig>): void => props.onChange({ ...props.config, ...patch });
</script>

<template>
  <CalendarBlockConfigFields unit="week" :config="config" :on-change="update" />
</template>
