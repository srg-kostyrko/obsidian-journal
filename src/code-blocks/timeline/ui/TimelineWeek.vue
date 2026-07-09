<script setup lang="ts">
import { computed } from "vue";

import { CalendarDate, WeekPeriod, type AnchorString } from "@/calendar";
import { NotesWeekView } from "@/notes-calendar";

const props = defineProps<{
  refDate: AnchorString;
  shelf: string | null;
  weeks?: "default" | "none" | "left" | "right";
  hiddenWeekdays?: readonly number[];
}>();

const week = computed(() => WeekPeriod.containing(CalendarDate.fromAnchor(props.refDate)));
</script>

<template>
  <div class="timeline-week">
    <NotesWeekView :shelf :week :weeks="weeks" :hidden-weekdays="hiddenWeekdays" />
  </div>
</template>

<style scoped>
.timeline-week {
  display: flex;
  justify-content: center;
}
.timeline-week > * {
  width: 400px;
}
</style>
