<script setup lang="ts">
import { date_from_string } from "@/calendar";
import type { Journal } from "@/journals/journal";
import { computed } from "vue";
import NavigationBlock from "@/code-blocks/navigation/NavigationBlock.vue";

const { date, journal } = defineProps<{
  date: string;
  journal: Journal;
}>();

const start = computed(() => date_from_string(date).startOf("month").format("YYYY-MM-DD"));
const end = computed(() => date_from_string(date).endOf("month").format("YYYY-MM-DD"));

const intervals = computed(() => journal.findAll(start.value, end.value));
</script>

<template>
  <div class="calendar-view-interval">
    <NavigationBlock
      v-for="interval of intervals"
      :key="interval.date"
      :rows="journal.calendarViewBlock.rows"
      :ref-date="interval.date"
      :journal-name="journal.name"
    />
  </div>
</template>

<style scoped>
.calendar-view-interval {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-2);
}
</style>
