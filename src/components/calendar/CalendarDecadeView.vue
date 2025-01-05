<script setup lang="ts">
import { computed } from "vue";
import { useDecade } from "@/composables/use-decade";
import { isSamePeriod } from "@/calendar";
import CalendarGrid from "./CalendarGrid.vue";
import CalendarButton from "./CalendarButton.vue";

const { refDate } = defineProps<{
  refDate: string;
  min?: string;
  max?: string;
}>();
defineEmits<(event: "select", date: string) => void>();

const { grid, startYear, endYear } = useDecade(computed(() => refDate));
</script>

<template>
  <CalendarGrid :columns="4">
    <template #header>
      <slot name="header" :start-year="startYear" :end-year="endYear">
        <div>{{ startYear }} - {{ endYear }}</div>
      </slot>
    </template>

    <CalendarButton
      v-for="year of grid"
      :key="year.key"
      clickable
      :data-selected="isSamePeriod('year', year.date, refDate) || null"
      :data-outside="year.outside || null"
      @click="$emit('select', year.key)"
    >
      {{ year.date }}
    </CalendarButton>
  </CalendarGrid>
</template>
