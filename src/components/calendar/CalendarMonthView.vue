<script setup lang="ts">
import { computed } from "vue";
import { usePlugin } from "@/composables/use-plugin";
import { useMonth } from "@/composables/use-month";
import FormattedDate from "./FormattedDate.vue";
import CalendarGrid from "./CalendarGrid.vue";
import CalendarButton from "./CalendarButton.vue";
import CalendarWeekdays from "./CalendarWeekdays.vue";

const { refDate } = defineProps<{
  refDate: string;
  selectedDate?: string | null;
}>();
defineEmits<(event: "select", date: string, nativeEvent: MouseEvent) => void>();

const plugin = usePlugin();
const columns = computed(() => (plugin.calendarViewSettings.weeks === "none" ? 7 : 8));

const { grid } = useMonth(computed(() => refDate));
</script>

<template>
  <CalendarGrid :columns>
    <template #header>
      <slot name="header">
        <FormattedDate :date="refDate" format="MMMM YYYY" />
      </slot>
    </template>

    <CalendarWeekdays />

    <CalendarButton
      v-for="uiDate of grid"
      :key="uiDate.key + (uiDate.isWeekNumber ? 'week' : 'day')"
      clickable
      :data-outside="uiDate.outside || null"
      :data-today="uiDate.today || null"
      :data-selected="selectedDate === uiDate.key || null"
      @click="$emit('select', uiDate.key, $event)"
    >
      {{ uiDate.date }}
    </CalendarButton>
  </CalendarGrid>
</template>
