import { ref, watchEffect, type Ref } from "vue";
import type { CalendarUiDay } from "../types/calendar-ui.types";
import { date_from_string, today } from "../calendar";
import { usePlugin } from "@/composables/use-plugin";
import { FRONTMATTER_DATE_FORMAT } from "@/constants";

export function useMonth(refDate: Ref<string>) {
  const grid = ref<CalendarUiDay[]>([]);
  const plugin = usePlugin();

  watchEffect(() => {
    const momentDate = date_from_string(refDate.value);
    if (!momentDate.isValid()) {
      return;
    }
    const todayDate = today();
    const start = momentDate.clone().startOf("month").startOf("week");
    const end = momentDate.clone().endOf("month").endOf("week");
    const placeWeeks = plugin.calendarViewSettings.weeks || "left";

    const days: CalendarUiDay[] = [];

    const current = start.clone();
    while (current.isSameOrBefore(end)) {
      if (placeWeeks === "left" && current.isSame(current.clone().startOf("week"), "day")) {
        days.push({
          date: current.format("[W]W"),
          key: current.format(FRONTMATTER_DATE_FORMAT),
          outside: false,
          isWeekNumber: true,
        });
      }

      days.push({
        date: current.format("D"),
        key: current.format(FRONTMATTER_DATE_FORMAT),
        today: current.isSame(todayDate, "day"),
        outside: !momentDate.isSame(current, "month"),
        isWeekNumber: false,
      });

      if (placeWeeks === "right" && current.isSame(current.clone().endOf("week"), "day")) {
        days.push({
          date: current.format("[W]W"),
          key: current.format(FRONTMATTER_DATE_FORMAT),
          outside: false,
          isWeekNumber: true,
        });
      }
      current.add(1, "day");
    }

    grid.value = days;
  });

  return { grid };
}
