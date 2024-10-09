import { computed, ref } from "vue";
import type { PluginSettings } from "../types/settings.types";
import { defaultPluginSettings } from "../defaults";
import { deepCopy } from "@/utils/misc";

export const pluginSettings$ = ref<PluginSettings>(deepCopy(defaultPluginSettings));

export const calendarSettings$ = computed(() => pluginSettings$.value.calendar);
export const calendarViewSettings$ = computed(() => pluginSettings$.value.calendarView);

export const journals$ = computed(() => ({ ...pluginSettings$.value.journals }));
export const journalsList$ = computed(() => Object.values(journals$.value));

export const journalsWithDays$ = computed(() => {
  return journalsList$.value.filter((journal) => journal.write.type === "day").map((journal) => journal.name);
});

export const journalsWithWeeks$ = computed(() => {
  return journalsList$.value.filter((journal) => journal.write.type === "week").map((journal) => journal.name);
});

export const journalsWithMonths$ = computed(() => {
  return journalsList$.value.filter((journal) => journal.write.type === "month").map((journal) => journal.name);
});

export const journalsWithQuarters$ = computed(() => {
  return journalsList$.value.filter((journal) => journal.write.type === "quarter").map((journal) => journal.name);
});

export const journalsWithYears$ = computed(() => {
  return journalsList$.value.filter((journal) => journal.write.type === "year").map((journal) => journal.name);
});

function decorationsForType(type: "day" | "week" | "month" | "quarter" | "year") {
  return computed(() => {
    return journalsList$.value
      .filter((journal) => journal.write.type === type)
      .flatMap((journal) =>
        journal.decorations.map((decoration) => ({
          journalName: journal.name,
          decoration,
        })),
      );
  });
}

export const decorationsForDays$ = decorationsForType("day");
export const decorationsForWeeks$ = decorationsForType("week");
export const decorationsForMonths$ = decorationsForType("month");
export const decorationsForQuarters$ = decorationsForType("quarter");
export const decorationsForYears$ = decorationsForType("year");
