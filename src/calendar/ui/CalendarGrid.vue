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
</style>
