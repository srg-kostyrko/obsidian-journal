<script setup lang="ts">
import { ref } from "vue";
import type { BulkAddPrams } from "./bulk-add-notes.types";
defineProps<{
  journalName: string;
  parameters: BulkAddPrams;
}>();

const stage = ref("Building list...");
// TODO
</script>

<template>
  <div>{{ stage }}</div>
</template>

<style scoped></style>
