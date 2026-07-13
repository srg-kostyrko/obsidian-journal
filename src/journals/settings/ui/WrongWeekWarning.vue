<script setup lang="ts">
import { m } from "@/i18n";
</script>

<template>
  <div class="journal-wrong-week-warning">{{ m.journal_edit_wrong_week_warning() }}</div>
</template>

<style scoped>
.journal-wrong-week-warning {
  color: var(--text-warning);
}
</style>
