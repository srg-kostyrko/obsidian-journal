import type { PinTarget } from "@/infrastructure/host";

import { isNotelet } from "../types";

import type { JournalsIndex } from "../journals-index";

// A journal's pinned tab is any pinned tab holding one of its entries. Notelets belong to the
// journal but are not its dated notes, so a pinned notelet is never moved.
export function journalPinGroup(index: JournalsIndex, journalName: string): PinTarget {
  return {
    sameGroup: (path) => {
      const entry = index.entryByPath(path);
      return entry.isSome() && !isNotelet(entry.value) && entry.value.journalName === journalName;
    },
  };
}
