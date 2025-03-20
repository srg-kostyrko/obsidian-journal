import { ref, watchEffect, type Ref } from "vue";
import type { CalendarUiElement } from "../types/calendar-ui.types";
import { date_from_string } from "../calendar";
import { FRONTMATTER_DATE_FORMAT } from "@/constants";
import { usePlugin } from "./use-plugin";

export function useYear(refDate: Ref<string>, minDate?: Ref<string | undefined>, maxDate?: Ref<string | undefined>) {
  const grid = ref<CalendarUiElement[]>([]);
  const plugin = usePlugin();

  watchEffect(() => {
    const momentDate = date_from_string(refDate.value);
    if (!momentDate.isValid()) {
      return;
    }
    // forcing dependency on week settings
    void plugin.calendarSettings.dow;
    const start = momentDate.clone().startOf("year");
    const end = momentDate.clone().endOf("year");
    const lowerBoundary = minDate?.value ? date_from_string(minDate.value) : undefined;
    const upperBoundary = maxDate?.value ? date_from_string(maxDate.value) : undefined;

    const months: CalendarUiElement[] = [];

    const current = start.clone();
    while (current.isSameOrBefore(end)) {
      months.push({
        date: current.format("MMMM"),
        key: current.format(FRONTMATTER_DATE_FORMAT),
        disabled:
          (!!lowerBoundary && current.clone().endOf("year").isBefore(lowerBoundary)) ||
          (!!upperBoundary && current.clone().startOf("year").isAfter(upperBoundary)),
      });
      current.add(1, "month");
    }

    grid.value = months;
  });

  return { grid };
}
