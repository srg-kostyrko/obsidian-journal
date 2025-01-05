import { ref, watchEffect, type Ref } from "vue";
import type { CalendarUiElement } from "../types/calendar-ui.types";
import { date_from_string } from "../calendar";
import { FRONTMATTER_DATE_FORMAT } from "@/constants";

export function useYear(refDate: Ref<string>, minDate?: Ref<string | undefined>, maxDate?: Ref<string | undefined>) {
  const grid = ref<CalendarUiElement[]>([]);

  watchEffect(() => {
    const momentDate = date_from_string(refDate.value);
    if (!momentDate.isValid()) {
      return;
    }
    const start = momentDate.clone().startOf("year");
    const end = momentDate.clone().endOf("year");
    const lowerBondary = minDate?.value ? date_from_string(minDate.value) : undefined;
    const upperBondary = maxDate?.value ? date_from_string(maxDate.value) : undefined;

    const months: CalendarUiElement[] = [];

    const current = start.clone();
    while (current.isSameOrBefore(end)) {
      months.push({
        date: current.format("MMMM"),
        key: current.format(FRONTMATTER_DATE_FORMAT),
        disabled:
          (!!lowerBondary && current.clone().endOf("year").isBefore(lowerBondary)) ||
          (!!upperBondary && current.clone().startOf("year").isAfter(upperBondary)),
      });
      current.add(1, "month");
    }

    grid.value = months;
  });

  return { grid };
}
