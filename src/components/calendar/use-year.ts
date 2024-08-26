import { ref, watchEffect, type Ref } from "vue";
import type { CalendarUiElement } from "../../types/calendar-ui.types";
import { date } from "../../calendar";

export function useYear(refDate: Ref<string>) {
  const grid = ref<CalendarUiElement[]>([]);

  watchEffect(() => {
    const momentDate = date(refDate.value);
    if (!momentDate.isValid()) {
      return;
    }
    const start = momentDate.clone().startOf("year");
    const end = momentDate.clone().endOf("year");

    const months: CalendarUiElement[] = [];

    const curr = start.clone();
    while (curr.isSameOrBefore(end)) {
      months.push({
        date: curr.clone(),
        key: curr.format("YYYY-MM-DD"),
      });
      curr.add(1, "month");
    }

    grid.value = months;
  });

  return { grid };
}
