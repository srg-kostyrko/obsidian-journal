import { date_from_string } from "@/calendar";
import { FRONTMATTER_DATE_FORMAT } from "@/constants";
import type { CalendarUiElement } from "@/types/calendar-ui.types";
import { computed, ref, watchEffect, type Ref } from "vue";

export function useDecade(refDate: Ref<string>, minDate?: Ref<string | undefined>, maxDate?: Ref<string | undefined>) {
  const grid = ref<CalendarUiElement[]>([]);
  const momentDate = computed(() => date_from_string(refDate.value));
  const startYear = computed(() => momentDate.value.year() - (momentDate.value.year() % 10));
  const endYear = computed(() => startYear.value + 9);

  watchEffect(() => {
    if (!momentDate.value.isValid()) {
      return;
    }

    const years: CalendarUiElement[] = [];
    const lowerBoundary = minDate?.value ? date_from_string(minDate.value) : undefined;
    const upperBoundary = maxDate?.value ? date_from_string(maxDate.value) : undefined;

    for (let i = startYear.value - 1; i <= endYear.value + 1; i++) {
      const date = momentDate.value.clone().year(i);
      years.push({
        date: date.format("YYYY"),
        key: date.format(FRONTMATTER_DATE_FORMAT),
        outside: i < startYear.value || i > endYear.value,
        disabled:
          (!!lowerBoundary && date.clone().endOf("year").isBefore(lowerBoundary)) ||
          (!!upperBoundary && date.clone().startOf("year").isAfter(upperBoundary)),
      });
    }

    grid.value = years;
  });

  return { grid, startYear, endYear };
}
