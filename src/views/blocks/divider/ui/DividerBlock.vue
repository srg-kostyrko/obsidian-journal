<script setup lang="ts">
import type { ViewBlockProps } from "../../../define-view-block";

defineProps<ViewBlockProps<Record<string, never>>>();
</script>

<template>
  <div class="journal-view-divider" role="separator" />
</template>

<style scoped>
.journal-view-divider {
  height: 1px;
  margin: var(--size-2-2) 0;
  border-bottom: 1px solid var(--color-accent);
}
</style>
