import { date_from_string } from "@/calendar";
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
      quarters.push({
        date: momentDate.value.clone().quarter(i),
        key: momentDate.value.clone().quarter(i).format("YYYY-MM-DD"),
      });
    }

    grid.value = quarters;
  });

  return { grid };
}
