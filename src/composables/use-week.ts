import { date_from_string, today } from "@/calendar";
import { usePlugin } from "@/composables/use-plugin";
import { FRONTMATTER_DATE_FORMAT } from "@/constants";
import type { CalendarUiDay } from "@/types/calendar-ui.types";
import { ref, watchEffect, type Ref } from "vue";

export function useWeek(refDate: Ref<string>) {
  const grid = ref<CalendarUiDay[]>([]);
  const plugin = usePlugin();

  watchEffect(() => {
    const momentDate = date_from_string(refDate.value);
    if (!momentDate.isValid()) {
      return;
    }
    // forcing dependency on week settings
    void plugin.calendarSettings.dow;
    const todayDate = today();
    const start = momentDate.clone().startOf("week");
    const end = momentDate.clone().endOf("week");
    const placeWeeks = plugin.calendarViewSettings.weeks || "left";

    const days: CalendarUiDay[] = [];

    if (placeWeeks === "left") {
      days.push({
        date: start.format("[W]w"),
        key: start.format(FRONTMATTER_DATE_FORMAT),
        outside: false,
        isWeekNumber: true,
        disabled: false,
      });
    }

    const current = start.clone();
    while (current.isSameOrBefore(end)) {
      days.push({
        date: current.format("D"),
        key: current.format(FRONTMATTER_DATE_FORMAT),
        today: current.isSame(todayDate, "day"),
        outside: !momentDate.isSame(current, "month"),
        isWeekNumber: false,
        disabled: false,
      });

      current.add(1, "day");
    }

    if (placeWeeks === "right") {
      days.push({
        date: start.format("[W]w"),
        key: start.format(FRONTMATTER_DATE_FORMAT),
        outside: false,
        isWeekNumber: true,
        disabled: false,
      });
    }

    grid.value = days;
  });

  return { grid };
}
