<script setup lang="ts">
import { computed, ref } from "vue";
import { today, date_from_string } from "../../calendar";
import CalendarMonth from "../calendar/CalendarMonth.vue";
import CalendarYear from "../calendar/CalendarYear.vue";
import ObsidianButton from "../obsidian/ObsidianButton.vue";
import ObsidianIconButton from "../obsidian/ObsidianIconButton.vue";

const props = defineProps<{
  selectedDate?: string;
}>();
const emit = defineEmits<{
  (e: "select", date: string): void;
  (e: "close"): void;
}>();

const mode = ref<"month" | "year">("month");

const currentDate = ref(props.selectedDate ?? today().format("YYYY-MM-DD"));
const currentDateMoment = computed(() => date_from_string(currentDate.value).startOf("month"));

function prev(step: "month" | "year" = "month") {
  currentDate.value = currentDateMoment.value.subtract(1, step).format("YYYY-MM-DD");
}
function next(step: "month" | "year" = "month") {
  currentDate.value = currentDateMoment.value.add(1, step).format("YYYY-MM-DD");
}

function selectDate(date: string) {
  emit("select", date);
  emit("close");
}
function selectMonth(date: string) {
  currentDate.value = date;
  mode.value = "month";
}
</script>

<template>
  <CalendarYear v-if="mode === 'year'" :ref-date="currentDate" @select="selectMonth">
    <template #header>
      <ObsidianIconButton icon="arrow-left" tooltip="Previous month" @click="prev('year')" />
      <div>{{ currentDateMoment.format("YYYY") }}</div>
      <ObsidianIconButton icon="arrow-right" tooltip="Next month" @click="next('year')" />
    </template>
  </CalendarYear>

  <CalendarMonth v-else :ref-date="currentDate" :selected-date="selectedDate" @select="selectDate">
    <template #header>
      <ObsidianIconButton icon="arrow-left" tooltip="Previous month" @click="prev" />
      <ObsidianButton @click="mode = 'year'">{{ currentDateMoment.format("MMMM YYYY") }}</ObsidianButton>
      <ObsidianIconButton icon="arrow-right" tooltip="Next month" @click="next" />
    </template>
  </CalendarMonth>
</template>
