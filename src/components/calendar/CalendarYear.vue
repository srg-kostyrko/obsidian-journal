<script setup lang="ts">
import { computed, toRefs } from "vue";
import { date_from_string } from "../../calendar";
import { useYear } from "./use-year";

const props = defineProps<{
  refDate: string;
}>();
defineEmits<(e: "select", date: string) => void>();

const { refDate } = toRefs(props);
const momentDate = computed(() => date_from_string(refDate.value));

const { grid } = useYear(refDate);
</script>

<template>
  <div class="calendar-year">
    <div class="calendar-year-header">
      <slot name="header">
        <div>{{ momentDate.format("YYYY") }}</div>
      </slot>
    </div>
    <div class="calendar-year-grid">
      <button
        v-for="month of grid"
        :key="month.key"
        :class="{ 'month--selected': month.date.isSame(momentDate, 'month') }"
        @click="$emit('select', month.key)"
      >
        {{ month.date.format("MMMM") }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.calendar-year-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  margin-bottom: 6px;
}
.calendar-year-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
button {
  cursor: pointer;
  background-color: transparent;
  box-shadow: none;
}
.month--selected {
  background-color: var(--interactive-accent);
  color: var(--text-on-accent);
}
</style>
