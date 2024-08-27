<script setup lang="ts">
import { computed, toRefs } from "vue";
import { useMonth } from "./use-month";
import { weekdayNames, date_from_string } from "../../calendar";
import { calendarViewSettings$ } from "../../stores/settings.store";
import CalendarDay from "./CalendarDay.vue";
import CalendarWeekNumber from "./CalendarWeekNumber.vue";

const props = defineProps<{
  refDate: string;
  selectedDate?: string;
}>();
defineEmits<(e: "select" | "selectWeek", date: string) => void>();

const { refDate } = toRefs(props);
const momentDate = computed(() => date_from_string(refDate.value));

const { grid } = useMonth(refDate);
</script>

<template>
  <div class="calendar-month">
    <div class="calendar-month-header">
      <slot name="header">
        <div>{{ momentDate.format("MMMM YYYY") }}</div>
      </slot>
    </div>
    <div class="calendar-month-grid" :class="[`weeks-${calendarViewSettings$.weeks}`]">
      <div v-if="calendarViewSettings$.weeks === 'left'"></div>
      <div v-for="day of weekdayNames" :key="day" class="calendar-month-grid-week-day">
        {{ day }}
      </div>
      <div v-if="calendarViewSettings$.weeks === 'right'"></div>

      <template v-for="uiDate of grid" :key="uiDate.key">
        <CalendarWeekNumber
          v-if="uiDate.isWeekNumber"
          :date="uiDate.date"
          class="calendar-week-number"
          @click="$emit('selectWeek', uiDate.date.format('YYYY-MM-DD'))"
        />
        <CalendarDay
          v-else
          :date="uiDate.date"
          class="calendar-day"
          :class="{
            'calendar-day--outside': uiDate.outside,
            'calendar-day--today': uiDate.today,
            'calendar-day--selected': selectedDate === uiDate.key,
          }"
          @click="$emit('select', uiDate.date.format('YYYY-MM-DD'))"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.calendar-month-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  margin-bottom: 6px;
}
.calendar-month-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 6px;
}
.calendar-month-grid.weeks-none {
  grid-template-columns: repeat(7, 1fr);
}

.calendar-week-number,
.calendar-day,
.calendar-month-grid-week-day {
  font-size: 0.7em;
  border: 1px solid transparent;
  height: 28px;
  line-height: 26px;
  text-align: center;
}
.calendar-day--outside {
  color: var(--code-comment);
}
.calendar-day--today {
  color: var(--text-accent);
  font-weight: 600;
}
.calendar-day--selected {
  background-color: var(--interactive-accent);
  color: var(--text-on-accent);
}
</style>
