<script setup lang="ts">
import { date_from_string } from "@/calendar";
import type { Journal } from "@/journals/journal";
import { computed } from "vue";
import NavigationBlock from "@/code-blocks/navigation/NavigationBlock.vue";
import { useActiveNoteData } from "@/composables/use-active-note-data";
import { usePlugin } from "@/composables/use-plugin";
import { colorToString } from "@/utils/color";

const { date, journal } = defineProps<{
  date: string;
  journal: Journal;
}>();

const plugin = usePlugin();

const start = computed(() => date_from_string(date).startOf("month").format("YYYY-MM-DD"));
const end = computed(() => date_from_string(date).endOf("month").format("YYYY-MM-DD"));

const intervals = computed(() => journal.findAll(start.value, end.value));

const activeNote = useActiveNoteData(plugin);
const isActive = computed(() => activeNote.value?.journal === journal.name);
const activeColor = computed(() => colorToString(plugin.calendarViewSettings.activeStyle.color));
const activeBackground = computed(() => colorToString(plugin.calendarViewSettings.activeStyle.background));
</script>

<template>
  <div class="calendar-view-interval">
    <NavigationBlock
      v-for="interval of intervals"
      :key="interval.date"
      :rows="journal.calendarViewBlock.rows"
      :ref-date="interval.date"
      :journal-name="journal.name"
      :class="{ 'is-active': isActive && interval.date === activeNote?.date }"
      :decorate-block="journal.calendarViewBlock.decorateWholeBlock"
    />
  </div>
</template>

<style scoped>
.calendar-view-interval {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-2);
}
.is-active {
  color: v-bind(activeColor);
  background-color: v-bind(activeBackground);
}
</style>
