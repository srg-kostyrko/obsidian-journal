import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";

import { useService } from "@/infrastructure/di";
import { JournalsViewModel } from "@/journals";
import type { JournalConfig, JournalWrite } from "@/journals";
import { ShelvesRepository } from "@/shelves";

export interface ShelfScope {
  readonly all: ComputedRef<readonly string[]>;
  readonly fixed: ComputedRef<readonly string[]>;
  readonly day: ComputedRef<readonly string[]>;
  readonly week: ComputedRef<readonly string[]>;
  readonly month: ComputedRef<readonly string[]>;
  readonly quarter: ComputedRef<readonly string[]>;
  readonly year: ComputedRef<readonly string[]>;
  readonly custom: ComputedRef<readonly string[]>;
}

export function useShelfScope(shelfName: MaybeRefOrGetter<string | null>): ShelfScope {
  const journalsVM = useService(JournalsViewModel);
  const shelves = useService(ShelvesRepository);

  const scopedJournals = computed<readonly JournalConfig[]>(() => {
    const name = toValue(shelfName);
    const all = journalsVM.journals.value;
    if (name === null) return all;
    const shelf = shelves.get(name);
    if (shelf.isNone()) return [];
    const allowed = new Set(shelf.value.journals);
    return all.filter((journal) => allowed.has(journal.name));
  });

  return {
    all: computed(() => scopedJournals.value.map((journal) => journal.name)),
    // Journals that own a calendar-grid cell. Custom intervals are anchored to a start date
    // that collides with a day cell, so they are excluded — they render in the interval list.
    fixed: computed(() =>
      scopedJournals.value.filter((journal) => journal.write.type !== "custom").map((journal) => journal.name),
    ),
    day: namesOfWrite(scopedJournals, "day"),
    week: namesOfWrite(scopedJournals, "week"),
    month: namesOfWrite(scopedJournals, "month"),
    quarter: namesOfWrite(scopedJournals, "quarter"),
    year: namesOfWrite(scopedJournals, "year"),
    custom: namesOfWrite(scopedJournals, "custom"),
  };
}

function namesOfWrite(
  scopedJournals: ComputedRef<readonly JournalConfig[]>,
  writeType: JournalWrite["type"],
): ComputedRef<readonly string[]> {
  return computed(() =>
    scopedJournals.value.filter((journal) => journal.write.type === writeType).map((journal) => journal.name),
  );
}
