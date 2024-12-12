<script setup lang="ts">
import { computed, ref } from "vue";
import { today, date_from_string } from "../../calendar";
import ObsidianButton from "../obsidian/ObsidianButton.vue";
import ObsidianIconButton from "../obsidian/ObsidianIconButton.vue";
import CalendarMonthView from "../calendar/CalendarMonthView.vue";
import CalendarQuarterView from "../calendar/CalendarQuarterView.vue";
import CalendarYearView from "../calendar/CalendarYearView.vue";
import CalendarDecadeView from "../calendar/CalendarDecadeView.vue";
import FormattedDate from "../calendar/FormattedDate.vue";

const props = defineProps<{
  selectedDate?: string;
  picking: "day" | "week" | "month" | "quarter" | "year";
}>();
const emit = defineEmits<{
  (error: "select", date: string): void;
  (error: "close"): void;
}>();

const mode = ref<"month" | "quarter" | "year" | "decade">("month");
switch (props.picking) {
  case "day": {
    mode.value = "month";
    break;
  }
  case "week": {
    mode.value = "month";
    break;
  }
  case "month": {
    mode.value = "month";
    break;
  }
  case "quarter": {
    mode.value = "quarter";
    break;
  }
  case "year": {
    mode.value = "decade";
    break;
  }
}

const currentDate = ref(props.selectedDate ?? today().format("YYYY-MM-DD"));
const currentDateMoment = computed(() => date_from_string(currentDate.value).startOf("month"));

function previous(step: "month" | "quarter" | "year" | "decade" = "month") {
  currentDate.value =
    step === "decade"
      ? currentDateMoment.value.subtract(10, "year").format("YYYY-MM-DD")
      : currentDateMoment.value.subtract(1, step).format("YYYY-MM-DD");
}
function next(step: "month" | "quarter" | "year" | "decade" = "month") {
  currentDate.value =
    step === "decade"
      ? currentDateMoment.value.add(10, "year").format("YYYY-MM-DD")
      : currentDateMoment.value.add(1, step).format("YYYY-MM-DD");
}

function selectDate(date: string) {
  if (props.picking === "week") {
    emit("select", date_from_string(currentDate.value).startOf("week").format("YYYY-MM-DD"));
  } else {
    emit("select", date);
  }
  emit("close");
}

function selectMonth(date: string) {
  if (props.picking === "month") {
    emit("select", date);
    emit("close");
  } else {
    currentDate.value = date;
    mode.value = "month";
  }
}
function selectQuarter(date: string) {
  if (props.picking === "quarter") {
    emit("select", date);
    emit("close");
  } else {
    currentDate.value = date;
    mode.value = "month";
  }
}
function selectYear(date: string) {
  if (props.picking === "year") {
    emit("select", date);
    emit("close");
  } else {
    currentDate.value = date;
    mode.value = props.picking === "quarter" ? "quarter" : "year";
  }
}
</script>

<template>
  <CalendarDecadeView v-if="mode === 'decade'" :ref-date="currentDate" @select="selectYear">
    <template #header="{ startYear, endYear }">
      <ObsidianIconButton icon="arrow-left" tooltip="Previous decade" @click="previous('decade')" />
      {{ startYear }} - {{ endYear }}
      <ObsidianIconButton icon="arrow-right" tooltip="Next decade" @click="next('decade')" />
    </template>
  </CalendarDecadeView>

  <CalendarYearView v-else-if="mode === 'year'" :ref-date="currentDate" @select="selectMonth">
    <template #header>
      <ObsidianIconButton icon="arrow-left" tooltip="Previous year" @click="previous('year')" />
      <ObsidianButton @click="mode = 'decade'">{{ currentDateMoment.format("YYYY") }}</ObsidianButton>
      <ObsidianIconButton icon="arrow-right" tooltip="Next year" @click="next('year')" />
    </template>
  </CalendarYearView>

  <CalendarQuarterView v-else-if="mode === 'quarter'" :ref-date="currentDate" @select="selectQuarter">
    <template #header>
      <ObsidianIconButton icon="arrow-left" tooltip="Previous quarter" @click="previous('quarter')" />
      <ObsidianButton @click="mode = 'year'">
        <FormattedDate :date="currentDate" format="YYYY" />
      </ObsidianButton>
      <ObsidianIconButton icon="arrow-right" tooltip="Next quarter" @click="next('quarter')" />
    </template>
  </CalendarQuarterView>

  <CalendarMonthView v-else :ref-date="currentDate" :selected-date="selectedDate" @select="selectDate">
    <template #header>
      <ObsidianIconButton icon="arrow-left" tooltip="Previous month" @click="previous" />
      <ObsidianButton @click="mode = 'year'">
        <FormattedDate :date="currentDate" format="MMMM YYYY" />
      </ObsidianButton>
      <ObsidianIconButton icon="arrow-right" tooltip="Next month" @click="next" />
    </template>
  </CalendarMonthView>
</template>
