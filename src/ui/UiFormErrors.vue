<script setup lang="ts">
defineProps<{
  errors?: string[];
}>();
</script>

<template>
  <ul v-if="errors && errors.length > 0" class="journal-errors">
    <li v-for="error in errors" :key="error">{{ error }}</li>
  </ul>
</template>

<style scoped>
.journal-errors {
  color: var(--text-error);
}
</style>
