<script setup lang="ts">
import { computed } from "vue";

import { Clock } from "@/calendar";

const { format } = defineProps<{ format: string }>();

const rendered = computed(() => Clock.now().format(format));
</script>

<template>
  <span class="journal-date-format-preview">{{ rendered }}</span>
</template>
