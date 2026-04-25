<script setup lang="ts">
import { usePlugin } from "@/composables/use-plugin";
import { useWeekdayNames } from "@/composables/use-weekday-names";

const plugin = usePlugin();
const weekdayNames = useWeekdayNames();
</script>

<template>
  <div v-if="plugin.calendarViewSettings.weeks === 'left'"></div>
  <div v-for="day of weekdayNames" :key="day" class="week-day">
    <span>{{ day }}</span>
  </div>
  <div v-if="plugin.calendarViewSettings.weeks === 'right'"></div>
</template>

<style scoped>
.week-day {
  font-size: 0.6em;
  border: 1px solid transparent;
  line-height: 1;
  text-align: center;
  padding: 0;
  color: var(--text-muted);
  display: flex;
  justify-content: center;
  align-items: end;
}
</style>
