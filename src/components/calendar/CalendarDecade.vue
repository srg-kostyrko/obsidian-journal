<script setup lang="ts">
import { computed, toRefs } from "vue";
import { date_from_string } from "../../calendar";
import { useDecade } from "./use-decade";

const props = defineProps<{
  refDate: string;
}>();
defineEmits<(e: "select", date: string) => void>();

const { refDate } = toRefs(props);
const momentDate = computed(() => date_from_string(refDate.value));

const { grid, startYear, endYear } = useDecade(refDate);
</script>

<template>
  <div class="calendar-decade">
    <div class="calendar-decade-header">
      <slot name="header" :start-year="startYear" :end-year="endYear">
        <div>{{ startYear }} - {{ endYear }}</div>
      </slot>
    </div>
    <div class="calendar-decade-grid">
      <button
        v-for="year of grid"
        :key="year.key"
        :class="{ 'year--selected': year.date.isSame(momentDate, 'year'), 'year--outside': year.outside }"
        @click="$emit('select', year.key)"
      >
        {{ year.date.format("YYYY") }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.calendar-decade-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  margin-bottom: 6px;
}
.calendar-decade-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
button {
  cursor: pointer;
  background-color: transparent;
  box-shadow: none;
}
.year--selected {
  background-color: var(--interactive-accent);
  color: var(--text-on-accent);
}
.year--outside {
  color: var(--code-comment);
}
</style>
