<script setup lang="ts">
import { computed, ref } from "vue";
import ObsidianIconButton from "../components/obsidian/ObsidianIconButton.vue";
import ObsidianButton from "../components/obsidian/ObsidianButton.vue";
import CalendarMonth from "../components/calendar/CalendarMonth.vue";
import DatePickerModal from "../components/modals/DatePicker.modal.vue";
import { VueModal } from "../components/modals/vue-modal";
import { today, date_from_string } from "../calendar";
import { openDate } from "@/journals/open-date";
import CalendarMonthButton from "@/components/calendar/CalendarMonthButton.vue";
import CalendarYearButton from "@/components/calendar/CalendarYearButton.vue";
import CalendarQuarterButton from "@/components/calendar/CalendarQuarterButton.vue";
import { ShelfSuggestModal } from "@/components/suggests/shelf-suggest";
import { useShelfProvider } from "@/composables/use-shelf";
import { useApp } from "@/composables/use-app";
import { usePlugin } from "@/composables/use-plugin";

const app = useApp();
const plugin = usePlugin();

const refDateMoment = ref(today());
const refDate = computed(() => refDateMoment.value.format("YYYY-MM-DD"));

const selectedShelf = computed({
  get() {
    return plugin.uiSettings.calendarShelf;
  },
  set(value) {
    plugin.uiSettings.calendarShelf = value;
  },
});
const shouldShowShelf = computed(() => {
  return (
    (plugin.usesShelves && Object.values(plugin.shelves).length > 0) ||
    plugin.journals.some((journal) => !journal.isOnShelf)
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
  new ShelfSuggestModal(
    app,
    plugin.shelves.map((s) => s.name),
    (shelf: string | null) => {
      selectedShelf.value = shelf;
    },
  ).open();
}

function navigate(amount: number, step: "month" | "year" = "month") {
  refDateMoment.value = refDateMoment.value.clone().add(amount, step);
}
function goToday(event: MouseEvent) {
  refDateMoment.value = today();
  if (plugin.calendarViewSettings.todayMode === "create") {
    openDay(refDate.value, event);
  } else if (plugin.calendarViewSettings.todayMode === "navigate") {
    const journals: string[] = [];
    for (const journal of plugin.journals) {
      const anchorDate = journal.resolveAnchorDate(refDate.value);
      if (!anchorDate) continue;
      const index = plugin.index.getJournalIndex(journal.name);
      if (!index) continue;
      if (index.get(anchorDate)) journals.push(journal.name);
    }
    openDate(plugin, refDate.value, journals, event).catch(console.error);
  }
}
function pickDate() {
  new VueModal(
    plugin,
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
    plugin,
    date,
    journals.day.value.map((journal) => journal.name),
    event,
  ).catch(console.error);
}
function openWeek(date: string, event: MouseEvent) {
  openDate(
    plugin,
    date,
    journals.week.value.map((journal) => journal.name),
    event,
  ).catch(console.error);
}
function openMonth(event: MouseEvent) {
  openDate(
    plugin,
    refDate.value,
    journals.month.value.map((journal) => journal.name),
    event,
  ).catch(console.error);
}
function openQuarter(event: MouseEvent) {
  openDate(
    plugin,
    refDate.value,
    journals.quarter.value.map((journal) => journal.name),
    event,
  ).catch(console.error);
}
function openYear(event: MouseEvent) {
  openDate(
    plugin,
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
