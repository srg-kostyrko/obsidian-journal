<script setup lang="ts">
import { date_from_string } from "@/calendar";
import type { MomentDate } from "@/types/date.types";
import { computed } from "vue";

const { date } = defineProps<{
  date: string | MomentDate;
  format: string;
}>();

const momentDate = computed(() => {
  if (typeof date === "string") {
    return date_from_string(date);
  }
  return date;
});
</script>

<template>
  <span>{{ momentDate.format(format) }}</span>
</template>

<style scoped></style>
