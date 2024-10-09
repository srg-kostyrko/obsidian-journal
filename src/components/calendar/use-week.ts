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

    const current = start.clone();
    while (current.isSameOrBefore(end)) {
      days.push({
        date: current.clone(),
        key: current.format("YYYY-MM-DD"),
        today: current.isSame(todayDate, "day"),
        outside: !momentDate.isSame(current, "month"),
        isWeekNumber: false,
      });

      current.add(1, "day");
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
