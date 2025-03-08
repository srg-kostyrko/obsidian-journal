<script setup lang="ts">
import { computed } from "vue";
import { usePlugin } from "@/composables/use-plugin";
import { colorToString } from "@/utils/color";

const { compactFirstLine } = defineProps<{ columns: number; compactFirstLine?: boolean }>();

const plugin = usePlugin();

const todayColor = computed(() => colorToString(plugin.calendarViewSettings.todayStyle.color));
const todayBackground = computed(() => colorToString(plugin.calendarViewSettings.todayStyle.background));

const activeColor = computed(() => colorToString(plugin.calendarViewSettings.activeStyle.color));
const activeBackground = computed(() => colorToString(plugin.calendarViewSettings.activeStyle.background));

const templateRows = computed(() => (compactFirstLine ? "1.2em repeat(auto-fill, 28px)" : "repeat(auto-fill, 28px)"));
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
  justify-content: center;
  gap: var(--size-2-2);
}
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(v-bind(columns), 1fr);
  grid-template-rows: v-bind(templateRows);
  gap: var(--size-2-2);
}

.calendar-grid > * {
  border: 1px solid transparent;
  line-height: 26px;
  text-align: center;
  padding: 0;
}

.calendar :deep([data-outside]) {
  color: var(--code-comment);
}
.calendar :deep([data-today]) {
  color: v-bind(todayColor);
  background-color: v-bind(todayBackground);
}
.calendar :deep([data-selected]) {
  color: v-bind(activeColor) !important;
  background-color: v-bind(activeBackground) !important;
}
</style>
