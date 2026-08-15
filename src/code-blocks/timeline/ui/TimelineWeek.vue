<script setup lang="ts">
import type { AnchorString } from "@/calendar";
import { usePeriodWindow } from "@/calendar/ui";
import { NotesWeekView } from "@/notes-calendar";

const props = defineProps<{
  refDate: AnchorString;
  shelf: string | null;
  weeks?: "none" | "left" | "right";
  hiddenWeekdays?: readonly number[];
  before?: number;
  after?: number;
}>();

const weekPeriods = usePeriodWindow(
  "week",
  () => props.refDate,
  () => props.before ?? 0,
  () => props.after ?? 0,
);
</script>

<template>
  <div class="timeline-week">
    <NotesWeekView
      v-for="week of weekPeriods"
      :key="week.start.toAnchor()"
      :shelf
      :week
      :weeks="weeks"
      :hidden-weekdays="hiddenWeekdays"
    />
  </div>
</template>

<style scoped>
.timeline-week {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--size-4-2);
}
.timeline-week > * {
  width: 400px;
}
</style>
