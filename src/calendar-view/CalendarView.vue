<script setup lang="ts">
import { computed, ref } from "vue";
import ObsidianIconButton from "../components/obsidian/ObsidianIconButton.vue";
import ObsidianButton from "../components/obsidian/ObsidianButton.vue";
import CalendarMonth from "../components/calendar/CalendarMonth.vue";
import DatePickerModal from "../components/modals/DatePicker.modal.vue";
import { VueModal } from "../components/modals/vue-modal";
import { today, date_from_string } from "../calendar";
import { pluginSettings$, journalsList$ } from "../stores/settings.store";
import { openDate } from "@/journals/open-date";
import CalendarMonthButton from "@/components/calendar/CalendarMonthButton.vue";
import CalendarYearButton from "@/components/calendar/CalendarYearButton.vue";
import CalendarQuarterButton from "@/components/calendar/CalendarQuarterButton.vue";
import { ShelfSuggestModal } from "@/components/suggests/shelf-suggest";
import { app$ } from "@/stores/obsidian.store";
import { useShelfProvider } from "@/composables/use-shelf";

const refDateMoment = ref(today());
const refDate = computed(() => refDateMoment.value.format("YYYY-MM-DD"));

const selectedShelf = computed({
  get() {
    return pluginSettings$.value.ui.calendarShelf;
  },
  set(value) {
    pluginSettings$.value.ui.calendarShelf = value;
  },
});
const shouldShowShelf = computed(() => {
  return (
    (pluginSettings$.value.useShelves && Object.values(pluginSettings$.value.shelves).length > 0) ||
    journalsList$.value.some((journal) => journal.shelves.length === 0)
  );
});

const { journals } = useShelfProvider(selectedShelf);

const daysClickable = computed(() => {
  return journals.day.value.length > 0;
});
const weeksClickable = computed(() => {
  return journals.week.value.length > 0;
});

function selectShelf() {
  new ShelfSuggestModal(app$.value, Object.keys(pluginSettings$.value.shelves), (shelf: string | null) => {
    selectedShelf.value = shelf;
  }).open();
}

function navigate(amount: number, step: "month" | "year" = "month") {
  refDateMoment.value = refDateMoment.value.clone().add(amount, step);
}
function goToday() {
  refDateMoment.value = today();
}
function pickDate() {
  new VueModal(
    "Pick a date",
    DatePickerModal,
    {
      selectedDate: refDate.value,
      onSelect(date: string) {
        refDateMoment.value = date_from_string(date);
      },
    },
    400,
  ).open();
}

function openDay(date: string, event: MouseEvent) {
  openDate(
    date,
    journals.day.value.map((journal) => journal.name),
    event,
  ).catch(console.error);
}
function openWeek(date: string, event: MouseEvent) {
  openDate(
    date,
    journals.week.value.map((journal) => journal.name),
    event,
  ).catch(console.error);
}
function openMonth(event: MouseEvent) {
  openDate(
    refDate.value,
    journals.month.value.map((journal) => journal.name),
    event,
  ).catch(console.error);
}
function openQuarter(event: MouseEvent) {
  openDate(
    refDate.value,
    journals.quarter.value.map((journal) => journal.name),
    event,
  ).catch(console.error);
}
function openYear(event: MouseEvent) {
  openDate(
    refDate.value,
    journals.year.value.map((journal) => journal.name),
    event,
  ).catch(console.error);
}
// TODO slim header to avoid scroll
</script>

<template>
  <div>
    <div class="calendar-view-header">
      <ObsidianButton v-if="shouldShowShelf" @click="selectShelf">
        {{ selectedShelf || "All journals" }}
      </ObsidianButton>
      <ObsidianIconButton icon="crosshair" tooltip="Select a date to be displayed" @click="pickDate" />
      <ObsidianButton @click="goToday">Today</ObsidianButton>
    </div>
    <CalendarMonth
      :ref-date="refDate"
      :select-days="daysClickable"
      :select-weeks="weeksClickable"
      @select="openDay"
      @select-week="openWeek"
    >
      <template #header>
        <ObsidianIconButton icon="chevrons-left" tooltip="Previous year" @click="navigate(-1, 'year')" />
        <ObsidianIconButton icon="chevron-left" tooltip="Previous month" @click="navigate(-1, 'month')" />
        <div class="calendar-month-header">
          <CalendarMonthButton :date="refDateMoment" @select="openMonth" />
          <CalendarQuarterButton v-if="journals.quarter.value.length > 0" :date="refDateMoment" @select="openQuarter" />
          <CalendarYearButton :date="refDateMoment" @select="openYear" />
        </div>

        <ObsidianIconButton icon="chevron-right" tooltip="Next month" @click="navigate(1, 'month')" />
        <ObsidianIconButton icon="chevrons-right" tooltip="Next year" @click="navigate(1, 'year')" />
      </template>
    </CalendarMonth>
  </div>
</template>

<style scoped>
.calendar-view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
}
.calendar-month-header {
  display: flex;
  align-items: center;
  gap: 2px;
}
.header-non-interactive {
  color: var(--icon-color);
  opacity: var(--icon-opacity);
  font-size: var(--font-ui-small);
}
</style>
