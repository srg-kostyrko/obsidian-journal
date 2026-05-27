import { computed, type ComputedRef } from "vue";

import { useService } from "@/infrastructure/di";
import { ShelvesRepository } from "@/shelves";

export function useShelfMateJournals(journalName: string): ComputedRef<readonly string[]> {
  const shelves = useService(ShelvesRepository);
  return computed(() => {
    const owning = [...shelves.find().list()].find((shelf) => shelf.journals.includes(journalName));
    if (!owning) return [];
    return owning.journals.filter((name) => name !== journalName);
  });
}
