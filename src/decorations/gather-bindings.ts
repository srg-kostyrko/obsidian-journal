import type { JournalsRepository } from "@/journals";

import { hasOffsetCondition, type DecorationBinding, type JournalDecorationBinding } from "./engine";

import type { DecorationsStore } from "./decorations-store";

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

// A custom journal writes "day"-kind periods, so its decorations would otherwise land on the
// day cell its interval starts on. These two are complementary halves of one rule: the day
// grid takes the offset-carrying decorations, the interval list takes the rest.
//
// This predicate is duplicated, not centralized: two calendar-render call sites reimplement the
// day-grid half directly against `useCellDecorations`'s own `filter` option rather than routing
// through `gatherFixedBindings` — `src/notes-calendar/ui/NotesMonthView.vue` and its verbatim
// twin `NotesWeekView.vue` — and two more reimplement the interval half the same way —
// `src/views/blocks/custom-intervals/ui/CustomIntervalsBlock.vue` and
// `src/code-blocks/nav/ui/NavigationCodeBlock.vue`'s per-row scope. Editing the split here does
// not touch any of them; keep all five in sync by hand.
export function gatherFixedBindings(
  journals: JournalsRepository,
  store: DecorationsStore | undefined,
  options: { readonly journalNames: readonly string[]; readonly shelf: string | null },
): readonly DecorationBinding[] {
  return gatherBindings(journals, store, {
    journalNames: options.journalNames,
    shelf: options.shelf,
    includeCalendar: true,
    filter: (binding) => {
      const config = journals.get(binding.journalName).getOrUndefined();
      if (config?.write.type !== "custom") return true;
      return hasOffsetCondition(binding.decoration);
    },
  });
}

// Never draws on calendar decorations (see the block comment above), so it takes no store or
// shelf — a caller has nothing to pass that could change the result.
export function gatherIntervalBindings(
  journals: JournalsRepository,
  options: { readonly journalName: string },
): readonly DecorationBinding[] {
  return gatherBindings(journals, undefined, {
    journalNames: [options.journalName],
    shelf: null,
    includeCalendar: false,
    filter: (binding) => !hasOffsetCondition(binding.decoration),
  });
}
