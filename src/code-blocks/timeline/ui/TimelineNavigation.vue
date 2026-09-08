<script setup lang="ts">
import { computed } from "vue";

import type { Period, PeriodKind } from "@/calendar";

import { navigationLabel } from "../navigation-label";

import TimelineNavReset from "./TimelineNavReset.vue";
import TimelineNavStep from "./TimelineNavStep.vue";

const props = defineProps<{
  periods: readonly Period[];
  unit: Exclude<PeriodKind, "day" | "decade">;
  moved: boolean;
}>();

const emit = defineEmits<{ step: [steps: number]; reset: [] }>();

const label = computed(() => navigationLabel(props.periods));
</script>

<template>
  <div class="timeline-navigation">
    <TimelineNavStep direction="prev" :unit @step="emit('step', $event)" />
    <span class="timeline-navigation__middle">
      <TimelineNavReset :unit mirror />
      <span class="timeline-navigation__label">{{ label }}</span>
      <TimelineNavReset :unit :moved @reset="emit('reset')" />
    </span>
    <TimelineNavStep direction="next" :unit @step="emit('step', $event)" />
  </div>
</template>

<style scoped>
/* Centred rather than spread to the row's edges: Obsidian overlays its own edit-block button
   on the top-right corner of a rendered code block, and a control parked under it never
   receives the click. Quarter and calendar modes span the whole block, so an edge-aligned next button sat
   exactly under it — and week and month reach the same edges in a narrow pane. */
.timeline-navigation {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--size-4-2);
}
.timeline-navigation__middle {
  display: flex;
  align-items: center;
  gap: var(--size-2-2);
}
.timeline-navigation__label {
  font-size: var(--font-ui-smaller);
  color: var(--text-muted);
  white-space: nowrap;
}
</style>
