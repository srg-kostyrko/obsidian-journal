import { ref, watchEffect, type Ref } from "vue";
import type { CalendarUiElement } from "../types/calendar-ui.types";
import { date_from_string } from "../calendar";
import { FRONTMATTER_DATE_FORMAT } from "@/constants";

export function useYear(refDate: Ref<string>) {
  const grid = ref<CalendarUiElement[]>([]);

  watchEffect(() => {
    const momentDate = date_from_string(refDate.value);
    if (!momentDate.isValid()) {
      return;
    }
    const start = momentDate.clone().startOf("year");
    const end = momentDate.clone().endOf("year");

    const months: CalendarUiElement[] = [];

    const current = start.clone();
    while (current.isSameOrBefore(end)) {
      months.push({
        date: current.format("MMMM"),
        key: current.format(FRONTMATTER_DATE_FORMAT),
      });
      current.add(1, "month");
    }

    grid.value = months;
  });

  return { grid };
}