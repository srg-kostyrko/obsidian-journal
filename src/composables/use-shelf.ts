import { SHELF_DATA_KEY } from "@/constants";
import type { ProvidedShelfData } from "@/types/provided-data.types";
import { computed, type MaybeRef, provide, toRef } from "vue";
import { usePlugin } from "./use-plugin";
import type { Journal } from "@/journals/journal";

export function useShelfProvider(shelfName: MaybeRef<string | null>) {
  const _shelfName = toRef(shelfName);
  const plugin = usePlugin();

  const journals = computed(() => {
    const name = _shelfName.value;
    if (plugin.usesShelves && name) {
      return plugin.journals.filter((journal) => journal.shelfName === name);
    }
    return plugin.journals;
  });
  const dailyJournals = computed(() => journals.value.filter((journal) => journal.type === "day"));
  const weeklyJournals = computed(() => journals.value.filter((journal) => journal.type === "week"));
  const monthlyJournals = computed(() => journals.value.filter((journal) => journal.type === "month"));
  const quarterlyJournals = computed(() => journals.value.filter((journal) => journal.type === "quarter"));
  const yearlyJournals = computed(() => journals.value.filter((journal) => journal.type === "year"));
  const customJournals = computed(() => journals.value.filter((journal) => journal.type === "custom"));
  const weekdaysJournals = computed(() => journals.value.filter((journal) => journal.type === "weekdays"));

  const dailyDecorations = computed(() => prepareDecorations(dailyJournals.value));
  const weeklyDecorations = computed(() => prepareDecorations(weeklyJournals.value));
  const monthlyDecorations = computed(() => prepareDecorations(monthlyJournals.value));
  const quarterlyDecorations = computed(() => prepareDecorations(quarterlyJournals.value));
  const yearlyDecorations = computed(() => prepareDecorations(yearlyJournals.value));
  const customDecorations = computed(() => prepareDecorations(customJournals.value));
  const weekdaysDecorations = computed(() => prepareDecorations(weekdaysJournals.value));

  const providedShelfData: ProvidedShelfData = {
    journals: {
      all: journals,
      day: dailyJournals,
      week: weeklyJournals,
      month: monthlyJournals,
      quarter: quarterlyJournals,
      year: yearlyJournals,
      custom: customJournals,
      weekdays: weekdaysJournals,
    },
    decorations: {
      day: dailyDecorations,
      week: weeklyDecorations,
      month: monthlyDecorations,
      quarter: quarterlyDecorations,
      year: yearlyDecorations,
      custom: customDecorations,
      weekdays: weekdaysDecorations,
    },
  };

  provide(SHELF_DATA_KEY, providedShelfData);

  return providedShelfData;
}

function prepareDecorations(journals: Journal[]) {
  return journals.flatMap((journal) =>
    journal.decorations.map((decoration) => ({
      journalName: journal.name,
      decoration,
    })),
  );
}
