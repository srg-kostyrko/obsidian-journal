import { computed, type ComputedRef } from "vue";

import { useService } from "@/infrastructure/di";
import { ShelvesRepository } from "@/shelves";

export function useShelfMateJournals(journalName: string): ComputedRef<readonly string[]> {
  const shelves = useService(ShelvesRepository);
  return computed(() =>
    shelves
      .find()
      .filter((shelf) => shelf.journals.includes(journalName))
      .first()
      .match({
        some: (shelf) => shelf.journals.filter((name) => name !== journalName),
        none: () => [],
      }),
  );
}
