<script setup lang="ts">
defineProps<{ columns: number }>();
</script>

<template>
  <div class="calendar">
    <div class="calendar-header">
      <slot name="header"> </slot>
    </div>
    <div class="calendar-grid">
      <slot></slot>
    </div>
  </div>
</template>

<style scoped>
.calendar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  margin-bottom: 6px;
}
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(v-bind(columns), 1fr);
  gap: 6px;
}

.calendar-grid > * {
  font-size: 0.7em;
  border: 1px solid transparent;
  height: 28px;
  line-height: 26px;
  text-align: center;
  padding: 0;
}

.calendar :deep([data-outside]) {
  color: var(--code-comment);
}
.calendar :deep([data-today]) {
  color: var(--text-accent);
  font-weight: 600;
}
.calendar :deep([data-selected]) {
  background-color: var(--interactive-accent);
  color: var(--text-on-accent);
}
</style>
