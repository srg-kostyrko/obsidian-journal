import { SHELF_DATA_KEY } from "@/constants";
import { journalsList$, pluginSettings$ } from "@/stores/settings.store";
import type { ProvidedShelfData } from "@/types/provided-data.types";
import type { JournalSettings } from "@/types/settings.types";
import { computed, type MaybeRef, provide, toRef } from "vue";

export function useShelfProvider(shelfName: MaybeRef<string | null>) {
  const _shelfName = toRef(shelfName);

  const journals = computed(() => {
    const name = _shelfName.value;
    if (pluginSettings$.value.useShelves && name) {
      return journalsList$.value.filter((journal) => journal.shelves.includes(name));
    }
    return journalsList$.value;
  });
  const dailyJournals = computed(() => journals.value.filter((journal) => journal.write.type === "day"));
  const weeklyJournals = computed(() => journals.value.filter((journal) => journal.write.type === "week"));
  const monthlyJournals = computed(() => journals.value.filter((journal) => journal.write.type === "month"));
  const quarterlyJournals = computed(() => journals.value.filter((journal) => journal.write.type === "quarter"));
  const yearlyJournals = computed(() => journals.value.filter((journal) => journal.write.type === "year"));
  const customJournals = computed(() => journals.value.filter((journal) => journal.write.type === "custom"));
  const weekdaysJournals = computed(() => journals.value.filter((journal) => journal.write.type === "weekdays"));

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

function prepareDecorations(journals: JournalSettings[]) {
  return journals.flatMap((journal) =>
    journal.decorations.map((decoration) => ({
      journalName: journal.name,
      decoration,
    })),
  );
}
