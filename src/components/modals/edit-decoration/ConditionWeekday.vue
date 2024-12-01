<script setup lang="ts">
import { moment } from "obsidian";
import { ref, watch } from "vue";
import type { JournalDecorationWeekdayCondition } from "@/types/settings.types";
import { usePlugin } from "@/composables/use-plugin";

const props = defineProps<{ condition: JournalDecorationWeekdayCondition }>();
const emit = defineEmits<
  <K extends keyof JournalDecorationWeekdayCondition>(
    event: "change",
    change: {
      prop: K;
      value: JournalDecorationWeekdayCondition[K];
    },
  ) => void
>();
const plugin = usePlugin();

const startWeekDay =
  plugin.calendarSettings.firstDayOfWeek === -1
    ? moment().localeData().firstDayOfWeek()
    : plugin.calendarSettings.firstDayOfWeek;

const weekDaysIndexes = [];
for (let i = startWeekDay; i < 7; ++i) weekDaysIndexes.push(i);
for (let i = 0; i < startWeekDay; ++i) weekDaysIndexes.push(i);
const weekDays = weekDaysIndexes.map((i) => ({
  label: moment().localeData().weekdaysShort()[i],
  value: i,
}));

const selected = ref([...props.condition.weekdays]);
watch(
  () => selected.value.length,
  () => {
    emit("change", { prop: "weekdays", value: [...selected.value] });
  },
);
</script>

<template>
  <div class="wrapper">
    <label v-for="{ label, value } of weekDays" :key="value">
      {{ label }}
      <input v-model="selected" type="checkbox" :value="value" />
    </label>
  </div>
</template>

<style scoped>
.wrapper {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}
.wrapper label {
  display: flex;
  flex-direction: column;
  align-items: center;
}
</style>
