<script setup lang="ts">
import { computed } from "vue";

import { CalendarDate, MonthPeriod, type AnchorString } from "@/calendar";
import { NotesMonthView } from "@/notes-calendar";

const props = defineProps<{
  refDate: AnchorString;
  shelf: string | null;
}>();

const month = computed(() => MonthPeriod.containing(CalendarDate.fromAnchor(props.refDate)));
</script>

<template>
  <div class="timeline-month">
    <NotesMonthView :shelf :month />
  </div>
</template>

<style scoped>
.timeline-month {
  display: flex;
  justify-content: center;
}
.timeline-month > * {
  width: 400px;
}
</style>
