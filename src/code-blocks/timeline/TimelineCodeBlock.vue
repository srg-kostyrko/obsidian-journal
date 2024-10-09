<script setup lang="ts">
import { usePathData } from "@/composables/use-path-data";
import { pluginSettings$ } from "@/stores/settings.store";
import { computed } from "vue";
import { timelineModes, type TimelineMode } from "./timeline.types";
import TimelineWeek from "./TimelineWeek.vue";
import TimelineMonth from "./TimelineMonth.vue";
import TimelineQuarter from "./TimelineQuarter.vue";
import TimelineCalendar from "./TimelineCalendar.vue";

const props = defineProps<{
  mode: string | undefined;
  path: string;
}>();

const noteData = usePathData(props.path);

const journalSettings = computed(() => {
  if (!noteData.value) return null;
  return pluginSettings$.value.journals[noteData.value.journal];
});

const mode = computed<TimelineMode>(() => {
  if (props.mode && timelineModes.includes(props.mode as TimelineMode)) return props.mode as TimelineMode;
  if (journalSettings.value) {
    switch (journalSettings.value.write.type) {
      case "day":
      case "week": {
        return "week";
      }
      case "month": {
        return "month";
      }
      case "quarter": {
        return "quarter";
      }
      case "year": {
        return "calendar";
      }
    }
  }
  return "week";
});

const component = computed(() => {
  switch (mode.value) {
    case "week": {
      return TimelineWeek;
    }
    case "month": {
      return TimelineMonth;
    }
    case "quarter": {
      return TimelineQuarter;
    }
    case "calendar": {
      return TimelineCalendar;
    }
  }
  return null;
});
</script>

<template>
  <div>
    <component :is="component" v-if="component" :note-data="noteData" />
    <div v-else>No component</div>
  </div>
</template>

<style scoped></style>
