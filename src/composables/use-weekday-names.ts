import { ref, watch } from "vue";
import { usePlugin } from "./use-plugin";
import { today } from "@/calendar";

export function useWeekdayNames() {
  const weekdayNames = ref<string[]>([]);
  const plugin = usePlugin();

  watch(
    () => plugin.calendarSettings.firstDayOfWeek,
    () => {
      const week = today().startOf("week");
      const weekEnd = week.clone().endOf("week");
      const names: string[] = [];
      while (week.isSameOrBefore(weekEnd)) {
        names.push(week.format("ddd"));
        week.add(1, "day");
      }

      weekdayNames.value = names;
    },
    { immediate: true },
  );

  return weekdayNames;
}
