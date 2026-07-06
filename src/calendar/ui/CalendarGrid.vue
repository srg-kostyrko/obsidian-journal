<script setup lang="ts">
defineProps<{ columns: number }>();
</script>

<template>
  <div class="calendar-grid">
    <div v-if="$slots.header" class="calendar-grid__header">
      <slot name="header" />
    </div>
    <div class="calendar-grid__body" :style="{ gridTemplateColumns: `repeat(${columns}, 1fr)` }">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.calendar-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.calendar-grid__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.calendar-grid__body {
  display: grid;
  gap: 4px;
}

.calendar-grid__body :deep(button) {
  background-color: transparent !important;
  box-shadow: none !important;
  border: 1px solid transparent;
  border-radius: var(--radius-s);
  padding: var(--size-2-1);
  color: var(--text-normal);
  text-align: center;
  cursor: pointer;
  line-height: 1.4;
}
.calendar-grid__body :deep(button:hover:not(:disabled)) {
  background-color: var(--background-modifier-hover) !important;
}
.calendar-grid__body :deep(button:focus-visible) {
  outline: 2px solid var(--background-modifier-border-focus);
  outline-offset: -1px;
}
.calendar-grid__body :deep(button:disabled) {
  cursor: not-allowed;
  opacity: 0.5;
}
.calendar-grid__body :deep(button[data-outside]) {
  color: var(--text-muted);
}
.calendar-grid__body :deep(button[data-today]) {
  color: var(--text-accent);
  font-weight: var(--font-bold);
}
.calendar-grid__body :deep(button[data-selected]) {
  background-color: var(--interactive-accent) !important;
  color: var(--text-on-accent);
}
.calendar-grid__body :deep(button[data-selected]:hover:not(:disabled)) {
  background-color: var(--interactive-accent-hover) !important;
}
</style>
