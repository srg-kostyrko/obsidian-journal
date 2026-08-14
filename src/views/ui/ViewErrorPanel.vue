<script setup lang="ts">
defineProps<{ message: string }>();
</script>

<template>
  <div class="journal-view-error">{{ message }}</div>
</template>

<style scoped>
/* Must read as plugin output rather than as an empty stretch of the view: unstyled, a
   missing block and a broken one look identical. */
.journal-view-error {
  margin: var(--size-4-2);
  padding: var(--size-4-2);
  border: 1px solid var(--text-error);
  border-radius: var(--radius-s);
  background-color: var(--background-modifier-error);
  color: var(--text-error);
  font-size: var(--font-ui-small);
}
</style>
