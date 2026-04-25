<script setup lang="ts">
import { useShelfData } from "@/composables/use-shelf";
import CalendarViewCustomInterval from "./CalendarViewCustomInterval.vue";

defineProps<{
  date: string;
}>();

const {
  journals: { custom },
} = useShelfData();
</script>

<template>
  <div class="custom-intervals-journals">
    <CalendarViewCustomInterval v-for="journal of custom" :key="journal.name" :date :journal />
  </div>
</template>

<style scoped>
.custom-intervals-journals > * {
  border-bottom: 1px solid var(--color-accent);
  padding-bottom: var(--size-2-2);
  margin-bottom: var(--size-4-2);
}
</style>
