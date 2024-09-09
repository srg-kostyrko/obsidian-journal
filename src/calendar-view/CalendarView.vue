<script setup lang="ts">
import { computed, ref } from "vue";
import ObsidianIconButton from "../components/obsidian/ObsidianIconButton.vue";
import ObsidianButton from "../components/obsidian/ObsidianButton.vue";
import CalendarMonth from "../components/calendar/CalendarMonth.vue";
import DatePickerModal from "../components/modals/DatePicker.modal.vue";
import { VueModal } from "../components/modals/vue-modal";
import { today, date_from_string } from "../calendar";

const redDateMoment = ref(today());
const refDate = computed(() => redDateMoment.value.format("YYYY-MM-DD"));

function navigate(amount: number, step: "month" | "year" = "month") {
  redDateMoment.value = redDateMoment.value.clone().add(amount, step);
}
function goToday() {
  redDateMoment.value = today();
}
function pickDate() {
  new VueModal(
    "Pick a date",
    DatePickerModal,
    {
      selectedDate: refDate.value,
      onSelect(date: string) {
        redDateMoment.value = date_from_string(date);
      },
    },
    400,
  ).open();
}
</script>

<template>
  <div>
    <div class="calendar-view-header">
      <ObsidianIconButton icon="crosshair" tooltip="Select a date to be displayed" @click="pickDate" />
      <ObsidianButton @click="goToday">Today</ObsidianButton>
    </div>
    <CalendarMonth :ref-date="refDate">
      <template #header>
        <ObsidianIconButton
          class="clickable-icon"
          icon="chevrons-left"
          tooltip="Previous year"
          @click="navigate(-1, 'year')"
        />
        <ObsidianIconButton
          class="clickable-icon"
          icon="chevron-left"
          tooltip="Previous month"
          @click="navigate(-1, 'month')"
        />
        {{ redDateMoment.format("MMMM YYYY") }}
        <ObsidianIconButton
          class="clickable-icon"
          icon="chevron-right"
          tooltip="Next month"
          @click="navigate(1, 'month')"
        />
        <ObsidianIconButton
          class="clickable-icon"
          icon="chevrons-right"
          tooltip="Next year"
          @click="navigate(1, 'year')"
        />
      </template>
    </CalendarMonth>
  </div>
</template>

<style scoped>
.calendar-view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  gap: 12px;
}
</style>
