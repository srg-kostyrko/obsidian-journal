<script setup lang="ts">
import { usePlugin } from "@/composables/use-plugin";
import { useWeekdayNames } from "@/composables/use-weekday-names";

const plugin = usePlugin();
const weekdayNames = useWeekdayNames();
</script>

<template>
  <div v-if="plugin.calendarViewSettings.weeks === 'left'"></div>
  <div v-for="day of weekdayNames" :key="day" class="week-day">
    {{ day }}
  </div>
  <div v-if="plugin.calendarViewSettings.weeks === 'right'"></div>
</template>

<style scoped>
.week-day {
  font-size: 0.7em;
  border: 1px solid transparent;
  height: 28px;
  line-height: 26px;
  text-align: center;
  padding: 0;
}
</style>
