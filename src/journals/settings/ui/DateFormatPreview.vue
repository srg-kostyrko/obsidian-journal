<script setup lang="ts">
import { computed } from "vue";

import { Clock } from "@/calendar";

import { formatHasWrongWeek } from "./wrong-week";
import WrongWeekWarning from "./WrongWeekWarning.vue";

const { format } = defineProps<{ format: string }>();

const rendered = computed(() => Clock.now().format(format));
const wrongWeek = computed(() => formatHasWrongWeek(format));
</script>

<template>
  <span class="journal-date-format-preview">{{ rendered }}</span>
  <WrongWeekWarning v-if="wrongWeek" />
</template>
