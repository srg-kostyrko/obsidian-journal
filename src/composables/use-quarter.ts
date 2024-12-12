import { date_from_string } from "@/calendar";
import { calendarFormats, FRONTMATTER_DATE_FORMAT } from "@/constants";
import type { CalendarUiElement } from "@/types/calendar-ui.types";
import { computed, ref, watchEffect, type Ref } from "vue";

export function useQuarter(refDate: Ref<string>) {
  const grid = ref<CalendarUiElement[]>([]);
  const momentDate = computed(() => date_from_string(refDate.value));

  watchEffect(() => {
    if (!momentDate.value.isValid()) {
      return;
    }

    const quarters: CalendarUiElement[] = [];

    for (let i = 0; i < 4; i++) {
      const date = momentDate.value.clone().quarter(i);
      quarters.push({
        date: date.format(calendarFormats.quarter),
        key: date.format(FRONTMATTER_DATE_FORMAT),
      });
    }

    grid.value = quarters;
  });

  return { grid };
}
