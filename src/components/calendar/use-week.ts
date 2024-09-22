import { date_from_string, today } from "@/calendar";
import { calendarViewSettings$ } from "@/stores/settings.store";
import type { CalendarUiDay } from "@/types/calendar-ui.types";
import { ref, watchEffect, type Ref } from "vue";

export function useWeek(refDate: Ref<string>) {
  const grid = ref<CalendarUiDay[]>([]);

  watchEffect(() => {
    const momentDate = date_from_string(refDate.value);
    if (!momentDate.isValid()) {
      return;
    }
    const todayDate = today();
    const start = momentDate.clone().startOf("week");
    const end = momentDate.clone().endOf("week");
    const placeWeeks = calendarViewSettings$.value.weeks || "left";

    const days: CalendarUiDay[] = [];

    if (placeWeeks === "left") {
      days.push({
        date: start.clone(),
        key: start.format("[W]W"),
        outside: false,
        isWeekNumber: true,
      });
    }

    const curr = start.clone();
    while (curr.isSameOrBefore(end)) {
      days.push({
        date: curr.clone(),
        key: curr.format("YYYY-MM-DD"),
        today: curr.isSame(todayDate, "day"),
        outside: !momentDate.isSame(curr, "month"),
        isWeekNumber: false,
      });

      curr.add(1, "day");
    }

    if (placeWeeks === "right") {
      days.push({
        date: start.clone(),
        key: start.format("[W]W"),
        outside: false,
        isWeekNumber: true,
      });
    }

    grid.value = days;
  });

  return { grid };
}
