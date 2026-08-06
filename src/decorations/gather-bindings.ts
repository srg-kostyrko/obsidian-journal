import type { JournalsRepository } from "@/journals";

import type { DecorationsStore } from "./decorations-store";
import type { DecorationBinding, JournalDecorationBinding } from "./engine";

export interface GatherOptions {
  readonly journalNames: readonly string[];
  // The shelf in scope, or null for "all journals", which takes every shelf's list — such a
  // surface shows every shelf's journals, so it already draws on all of their decorations.
  readonly shelf: string | null;
  // Surfaces that never render journal-free decorations opt out entirely.
  readonly includeCalendar: boolean;
  readonly filter?: (binding: JournalDecorationBinding) => boolean;
}

// Vault-wide, then shelf, then journal: resolveCell() takes the last declaration of each
// exclusive property, so gathering order is what makes the most specific owner win.
export function gatherBindings(
  journals: JournalsRepository,
  store: DecorationsStore | undefined,
  options: GatherOptions,
): readonly DecorationBinding[] {
  const out: DecorationBinding[] = [];
  const accept = options.filter ?? ((): boolean => true);

  if (options.includeCalendar && store) {
    const globalDecorations = store.calendarList({ kind: "global" });
    for (const [index, decoration] of globalDecorations.entries()) {
      out.push({ kind: "calendar", owner: { kind: "global" }, index, decoration });
    }
    const shelfNames = options.shelf === null ? store.shelfNames() : [options.shelf];
    for (const shelfName of shelfNames) {
      const shelfDecorations = store.calendarList({ kind: "shelf", shelfName });
      for (const [index, decoration] of shelfDecorations.entries()) {
        out.push({ kind: "calendar", owner: { kind: "shelf", shelfName }, index, decoration });
      }
    }
  }

  for (const name of options.journalNames) {
    const opt = journals.get(name);
    if (opt.isNone()) continue;
    for (const [index, decoration] of opt.value.decorations.entries()) {
      const binding: JournalDecorationBinding = { kind: "journal", journalName: name, index, decoration };
      if (accept(binding)) out.push(binding);
    }
  }

  return out;
}
