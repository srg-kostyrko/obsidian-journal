<script setup lang="ts">
import { computed, ref } from "vue";
import ObsidianIconButton from "../components/obsidian/ObsidianIconButton.vue";
import ObsidianButton from "../components/obsidian/ObsidianButton.vue";
import CalendarMonth from "../components/calendar/CalendarMonth.vue";
import DatePickerModal from "../components/modals/DatePicker.modal.vue";
import { VueModal } from "../components/modals/vue-modal";
import { today, date_from_string } from "../calendar";
import {
  journalsWithDays$,
  journalsWithWeeks$,
  journalsWithMonths$,
  journalsWithQuarters$,
  journalsWithYears$,
} from "../stores/settings.store";
import { openDate } from "@/journals/open-date";

const refDateMoment = ref(today());
const refDate = computed(() => refDateMoment.value.format("YYYY-MM-DD"));

const daysClickable = computed(() => {
  return journalsWithDays$.value.length > 0;
});
const weeksClickable = computed(() => {
  return journalsWithWeeks$.value.length > 0;
});
const monthsClickable = computed(() => {
  return journalsWithMonths$.value.length > 0;
});
const quartersClickable = computed(() => {
  return journalsWithQuarters$.value.length > 0;
});
const yearsClickable = computed(() => {
  return journalsWithYears$.value.length > 0;
});

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
  openDate(date, journalsWithDays$.value, event);
}
function openWeek(date: string, event: MouseEvent) {
  openDate(date, journalsWithWeeks$.value, event);
}
function openMonth(event: MouseEvent) {
  openDate(refDate.value, journalsWithMonths$.value, event);
}
function openQuarter(event: MouseEvent) {
  openDate(refDate.value, journalsWithQuarters$.value, event);
}
function openYear(event: MouseEvent) {
  openDate(refDate.value, journalsWithYears$.value, event);
}
// TODO slim header to avoid scroll
</script>

<template>
  <div>
    <div class="calendar-view-header">
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
          <ObsidianButton v-if="monthsClickable" flat @click="openMonth">
            {{ refDateMoment.format("MMMM") }}
          </ObsidianButton>
          <span v-else>
            {{ refDateMoment.format("MMMM") }}
          </span>
          <ObsidianButton v-if="quartersClickable" flat @click="openQuarter">
            {{ refDateMoment.format("[Q]Q") }}
          </ObsidianButton>
          <ObsidianButton v-if="yearsClickable" flat @click="openYear">
            {{ refDateMoment.format("YYYY") }}
          </ObsidianButton>
          <span v-else class="header-non-interactive">
            {{ refDateMoment.format("YYYY") }}
          </span>
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
