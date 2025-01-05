<script setup lang="ts">
import { useQuarter } from "@/composables/use-quarter";
import { computed } from "vue";
import CalendarGrid from "./CalendarGrid.vue";
import FormattedDate from "./FormattedDate.vue";
import CalendarButton from "./CalendarButton.vue";
import { isSamePeriod } from "@/calendar";

const { refDate, min, max } = defineProps<{
  refDate: string;
  min?: string;
  max?: string;
}>();
defineEmits<(event: "select", date: string) => void>();

const { grid } = useQuarter(
  computed(() => refDate),
  computed(() => min),
  computed(() => max),
);
</script>

<template>
  <CalendarGrid :columns="2">
    <template #header>
      <slot name="header">
        <FormattedDate :date="refDate" format="YYYY" />
      </slot>
    </template>

    <div class="calendar-quarter-grid">
      <CalendarButton
        v-for="quarter of grid"
        :key="quarter.key"
        clickable
        :data-selected="isSamePeriod('quarter', quarter.date, refDate) || null"
        @click="$emit('select', quarter.key)"
      >
        {{ quarter.date }}
      </CalendarButton>
    </div>
  </CalendarGrid>
</template>
