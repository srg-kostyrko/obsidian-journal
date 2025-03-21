import { SHELF_DATA_KEY } from "@/constants";
import type { ProvidedShelfData } from "@/types/provided-data.types";
import { computed, inject, type MaybeRef, provide, toRef } from "vue";
import { usePlugin } from "./use-plugin";
import type { Journal } from "@/journals/journal";
import type { JournalDecoration } from "@/types/settings.types";

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

  const dailyDecorations = computed(() => [
    ...prepareDecorations(dailyJournals.value),
    ...prepareDecorations(customJournals.value, (decoration) => decoration.conditions.some((c) => c.type === "offset")),
  ]);
  const weeklyDecorations = computed(() => prepareDecorations(weeklyJournals.value));
  const monthlyDecorations = computed(() => prepareDecorations(monthlyJournals.value));
  const quarterlyDecorations = computed(() => prepareDecorations(quarterlyJournals.value));
  const yearlyDecorations = computed(() => prepareDecorations(yearlyJournals.value));
  const customDecorations = computed(() =>
    prepareDecorations(customJournals.value, (decoration) => !decoration.conditions.some((c) => c.type === "offset")),
  );

  const providedShelfData: ProvidedShelfData = {
    journals: {
      all: journals,
      day: dailyJournals,
      week: weeklyJournals,
      month: monthlyJournals,
      quarter: quarterlyJournals,
      year: yearlyJournals,
      custom: customJournals,
    },
    decorations: {
      day: dailyDecorations,
      week: weeklyDecorations,
      month: monthlyDecorations,
      quarter: quarterlyDecorations,
      year: yearlyDecorations,
      custom: customDecorations,
    },
  };

  provide(SHELF_DATA_KEY, providedShelfData);

  return providedShelfData;
}

function prepareDecorations(journals: Journal[], filter: (decoration: JournalDecoration) => boolean = () => true) {
  return journals.flatMap((journal) =>
    journal.decorations
      .filter((element) => filter(element))
      .map((decoration) => ({
        journalName: journal.name,
        decoration,
      })),
  );
}

export function useShelfData(): ProvidedShelfData {
  const data = inject(SHELF_DATA_KEY);
  if (!data) throw new Error("Shelf data not provided or composable used outside of vue context");
  return data;
}
