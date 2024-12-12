<script setup lang="ts">
import { useYear } from "@/composables/use-year";
import { computed } from "vue";
import CalendarGrid from "./CalendarGrid.vue";
import FormattedDate from "./FormattedDate.vue";
import CalendarButton from "./CalendarButton.vue";
import { isSamePeriod } from "@/calendar";

const { refDate } = defineProps<{
  refDate: string;
}>();
defineEmits<(event: "select", date: string) => void>();

const { grid } = useYear(computed(() => refDate));
</script>

<template>
  <CalendarGrid :columns="3">
    <template #header>
      <slot name="header">
        <FormattedDate :date="refDate" format="YYYY" />
      </slot>
    </template>

    <CalendarButton
      v-for="month of grid"
      :key="month.key"
      clickable
      :data-selected="isSamePeriod('month', month.date, refDate) || null"
      @click="$emit('select', month.key)"
    >
      {{ month.date }}
    </CalendarButton>
  </CalendarGrid>
</template>
