import type { AnchorString, CalendarDate } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { SuggestService, WorkspaceService } from "@/infrastructure/host";

import { CycleService } from "../cycle";
import { JournalsIndex } from "../journals-index";
import { journalPickerSuggest } from "../notes/journal-picker";
import { JournalsRepository } from "../repository";
import { TimelineService } from "../timeline";

export interface ApplicableJournal {
  readonly name: string;
  readonly anchor: AnchorString;
}

export class JournalDateResolver {
  readonly #journals = inject(JournalsRepository);
  readonly #timeline = inject(TimelineService);
  readonly #index = inject(JournalsIndex);
  readonly #cycle = inject(CycleService);
  readonly #suggests = inject(SuggestService);
  readonly #workspace = inject(WorkspaceService);

  // The date is wherever the caller pointed — a day cell, today, a nav row in a daily note —
  // while each journal answers for the period of its own granularity containing it. Resolve
  // per journal before any entry is read or written by it: a weekly journal handed a
  // mid-week day would otherwise store that day as the entry's identity, which parseEntry
  // rejects as non-canonical, and look up an existing entry under an anchor it never owns.
  applicable(
    date: CalendarDate,
    journalNames: readonly string[] | undefined,
    existingOnly: boolean,
  ): ApplicableJournal[] {
    const all = [...this.#journals.find().ids()];
    const candidates = journalNames ? all.filter((name) => journalNames.includes(name)) : all;
    return candidates.flatMap((name) => {
      const resolved = this.#cycle.anchorOf(name, date);
      if (resolved.isNone()) return [];
      const anchor = resolved.value;
      if (!this.#timeline.contains(name, anchor)) return [];
      if (existingOnly && this.#index.entryByAnchor(name, anchor).isNone()) return [];
      return [{ name, anchor }];
    });
  }

  // Answers only "which name did the user choose"; mapping that back to a candidate — and
  // deciding what an unknown name means — stays with the caller, which is what lets
  // OpenDateFlow keep reporting NoApplicableJournals for it rather than an abort.
  /** null means the user dismissed the picker. */
  async pick(names: readonly string[], pickAt?: MouseEvent): Promise<string | null> {
    const options = [...names];
    const choice = pickAt
      ? await this.#workspace.pickFromMenu(options, pickAt)
      : await this.#suggests.open(journalPickerSuggest, options);
    return choice.isErr() ? null : choice.value;
  }
}
