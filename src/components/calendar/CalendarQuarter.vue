<script setup lang="ts">
import { computed, toRefs } from "vue";
import { date_from_string } from "../../calendar";
import { useQuarter } from "./use-quarter";

const props = defineProps<{
  refDate: string;
}>();
defineEmits<(e: "select", date: string) => void>();

const { refDate } = toRefs(props);
const momentDate = computed(() => date_from_string(refDate.value));

const { grid } = useQuarter(refDate);
</script>

<template>
  <div class="calendar-quarter">
    <div class="calendar-quarter-header">
      <slot name="header">
        <div>{{ momentDate.format("YYYY") }}</div>
      </slot>
    </div>
    <div class="calendar-quarter-grid">
      <button
        v-for="quarter of grid"
        :key="quarter.key"
        :class="{ 'quarter--selected': quarter.date.isSame(momentDate, 'quarter') }"
        @click="$emit('select', quarter.key)"
      >
        {{ quarter.date.format("[Q]Q") }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.calendar-quarter-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  margin-bottom: 6px;
}
.calendar-quarter-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}
button {
  cursor: pointer;
  background-color: transparent;
  box-shadow: none;
}
.quarter--selected {
  background-color: var(--interactive-accent);
  color: var(--text-on-accent);
}
</style>
