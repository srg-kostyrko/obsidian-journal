import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";

import { useService } from "@/infrastructure/di";
import { JournalsRepository } from "@/journals";

import { DecorationsStore } from "./decorations-store";
import { gatherBindings } from "./gather-bindings";
import { resolveCell, type PaddingExtents } from "./resolve-cell";

import type { JournalDecorationBinding } from "./engine";

export interface CellPaddingOptions {
  journalNames: MaybeRefOrGetter<readonly string[]>;
  filter?: (binding: JournalDecorationBinding) => boolean;
  // Presence opts the scope into journal-free decorations, exactly as in useCellDecorations.
  calendarDecorations?: { shelf: MaybeRefOrGetter<string | null> };
}

// What every cell in a scope reserves, taken from the decorations the scope can draw rather
// than from the ones that currently match: surfaces over the same journals then size their
// cells identically whatever their own cells happen to hold, and a note gaining a decoration
// does not reflow the grid around it.
export function useCellPadding(options: CellPaddingOptions): ComputedRef<PaddingExtents> {
  const journals = useService(JournalsRepository);
  const store = options.calendarDecorations ? useService(DecorationsStore) : undefined;

  return computed(() => {
    const calendar = options.calendarDecorations;
    const bindings = gatherBindings(journals, store, {
      journalNames: toValue(options.journalNames),
      shelf: calendar ? toValue(calendar.shelf) : null,
      includeCalendar: calendar !== undefined,
      filter: options.filter,
    });
    return resolveCell(bindings.flatMap((binding) => binding.decoration.styles)).padding;
  });
}
