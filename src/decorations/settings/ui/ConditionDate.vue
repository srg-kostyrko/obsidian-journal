<script setup lang="ts">
import { useField } from "vee-validate";
import { computed } from "vue";

import { Calendar, CalendarDate } from "@/calendar";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";

import {
  DATE_CONDITION_ANY,
  DATE_CONDITION_LAST_DAY,
  displayMonthToStored,
  isWeekdayOfMonth,
  storedMonthToDisplay,
  type DateConditionDay,
  type DateConditionWeekdayOfMonth,
} from "../../date-condition";

const { name } = defineProps<{ name: string }>();
const { value: day } = useField<DateConditionDay>(`${name}.day`);
const { value: month } = useField<number>(`${name}.month`);
const { value: year } = useField<number | null>(`${name}.year`);

const calendar = useService(Calendar);
const monthNames = calendar.months();

const ORDINALS: readonly DateConditionWeekdayOfMonth["nth"][] = [1, 2, 3, 4, 5, "last"];
const LAST_DAY_OPTION = "last-day";
const NTH_PREFIX = "nth:";

// A computed so the order follows the week grid, as in ConditionWeekday.
const weekdayOptions = computed(() => {
  const names = calendar.weekdays();
  return calendar.weekdaysShort().map(({ index }) => ({ value: String(index), label: names[index] ?? "" }));
});

function isNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// Day is stored 1-based, month 0-based (matching the date the period falls on); the empty
// option stores the wildcard sentinel (-1 / null) meaning "match any".
const weekdayOfMonth = computed(() => (isWeekdayOfMonth(day.value) ? day.value : undefined));

const daySelect = computed<string>({
  get: () => {
    if (day.value === DATE_CONDITION_ANY) return "";
    if (day.value === DATE_CONDITION_LAST_DAY) return LAST_DAY_OPTION;
    if (isWeekdayOfMonth(day.value)) return `${NTH_PREFIX}${day.value.nth}`;
    return String(day.value);
  },
  set: (next) => {
    if (next === "") day.value = DATE_CONDITION_ANY;
    else if (next === LAST_DAY_OPTION) day.value = DATE_CONDITION_LAST_DAY;
    else if (next.startsWith(NTH_PREFIX)) {
      const nth = ORDINALS.find((candidate) => `${NTH_PREFIX}${candidate}` === next) ?? 1;
      day.value = { nth, weekday: weekdayOfMonth.value?.weekday ?? CalendarDate.today().weekday() };
    } else day.value = Number(next);
  },
});

const weekdaySelect = computed<string>({
  get: () => String(weekdayOfMonth.value?.weekday ?? ""),
  set: (next) => {
    if (weekdayOfMonth.value) day.value = { nth: weekdayOfMonth.value.nth, weekday: Number(next) };
  },
});

const monthSelect = computed<string>({
  get: () => (month.value === DATE_CONDITION_ANY ? "" : String(storedMonthToDisplay(month.value))),
  set: (next) => {
    month.value = next === "" ? DATE_CONDITION_ANY : displayMonthToStored(Number(next));
  },
});

const yearModel = computed<number | undefined>({
  get: () => year.value ?? undefined,
  set: (next) => {
    year.value = isNumber(next) ? next : null;
  },
});
</script>

<template>
  <div class="condition-date">
    <UiDropdown v-model="daySelect" :aria-label="m.decoration_condition_date_unit_label({ unit: 'day' })">
      <option value="">{{ m.decoration_condition_date_any_unit({ unit: "day" }) }}</option>
      <option v-for="dayNumber in 31" :key="dayNumber" :value="String(dayNumber)">{{ dayNumber }}</option>
      <option :value="LAST_DAY_OPTION">{{ m.decoration_condition_date_last_day() }}</option>
      <optgroup :label="m.decoration_condition_date_weekday_of_month_group()">
        <option v-for="nth in ORDINALS" :key="nth" :value="`${NTH_PREFIX}${nth}`">
          {{ m.decoration_condition_date_ordinal({ nth }) }}
        </option>
      </optgroup>
    </UiDropdown>
    <UiDropdown v-if="weekdayOfMonth" v-model="weekdaySelect" :aria-label="m.decoration_condition_date_weekday_label()">
      <option v-for="option in weekdayOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
    </UiDropdown>
    <UiDropdown v-model="monthSelect" :aria-label="m.decoration_condition_date_unit_label({ unit: 'month' })">
      <option value="">{{ m.decoration_condition_date_any_unit({ unit: "month" }) }}</option>
      <option v-for="(monthName, monthIndex) in monthNames" :key="monthIndex" :value="String(monthIndex + 1)">
        {{ monthName }}
      </option>
    </UiDropdown>
    <UiNumberInput
      v-model="yearModel"
      :aria-label="m.decoration_condition_date_unit_label({ unit: 'year' })"
      :placeholder="m.decoration_condition_date_any_unit({ unit: 'year' })"
    />
  </div>
</template>

<style scoped>
/* Wraps rather than shrinking like the property row: an ordinal adds a fourth control, and a
   squeezed dropdown cuts off the weekday or month name it exists to show. */
.condition-date {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--size-2-2);
}
</style>
