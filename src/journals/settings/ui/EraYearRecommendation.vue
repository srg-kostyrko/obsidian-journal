<script setup lang="ts">
import { m } from "@/i18n";

defineProps<{ show: boolean }>();
defineEmits<{ apply: [] }>();
</script>

<template>
  <div v-if="show" class="journal-recommendation">
    {{ m.journal_edit_era_year_recommendation() }}
    <a href="#" @click.prevent="$emit('apply')">{{ m.journal_edit_move_to_folder_apply_link() }}</a>
  </div>
</template>

<style scoped>
.journal-recommendation {
  color: var(--text-warning);
  padding: var(--size-2-2) 0;
}
</style>
