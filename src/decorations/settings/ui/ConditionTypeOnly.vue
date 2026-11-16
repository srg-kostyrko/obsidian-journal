<script setup lang="ts">
import type { JournalDecorationCondition } from "@/decorations";

import { describeCondition } from "./describe-condition";

const { type } = defineProps<{
  type: Extract<JournalDecorationCondition["type"], "has-note">;
}>();
</script>

<template>
  <span>{{ describeCondition({ type }) }}</span>
</template>
