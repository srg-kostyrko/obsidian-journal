<script setup lang="ts">
import { Calendar } from "@/calendar";
import type { JournalDecorationCondition } from "@/decorations";
import { useService } from "@/infrastructure/di";

import { describeCondition } from "./describe-condition";

const { type } = defineProps<{
  type: Extract<JournalDecorationCondition["type"], "has-note" | "has-open-task" | "all-tasks-completed">;
}>();

const calendar = useService(Calendar);
</script>

<template>
  <span>{{ describeCondition({ type }, calendar) }}</span>
</template>
