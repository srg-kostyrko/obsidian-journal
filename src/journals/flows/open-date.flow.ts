import { CalendarDate } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { Flows, UserAborted } from "@/infrastructure/flows";
import type { Flow } from "@/infrastructure/flows";
import { SuggestService, WorkspaceService } from "@/infrastructure/host";
import type { OpenMode, VaultPath, WorkspaceOpenError } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";

import { CycleService } from "../cycle";
import { JournalsIndex } from "../journals-index";
import { NoApplicableJournals } from "../notes/errors";
import { journalPickerSuggest } from "../notes/journal-picker";
import { JournalsRepository } from "../repository";
import { TimelineService } from "../timeline";

import { OpenJournalEntryFlow } from "./open-journal-entry.flow";

import type { NoteCreationError } from "../notes/note-creation";

export interface OpenDateParameters {
  anchor: AnchorString;
  journalNames?: readonly string[];
  openMode?: OpenMode;
  existingOnly?: boolean;
  // The originating mouse event, when there is one: multi-journal disambiguation then
  // shows a menu at the pointer (v2 behavior) instead of the centered suggest.
  pickAt?: MouseEvent;
}

export interface OpenDateResult {
  path: VaultPath;
  created: boolean;
}

export type OpenDateError = NoApplicableJournals | NoteCreationError | WorkspaceOpenError | UserAborted;

export class OpenDateFlow implements Flow<OpenDateParameters, OpenDateResult, OpenDateError> {
  readonly #journals = inject(JournalsRepository);
  readonly #timeline = inject(TimelineService);
  readonly #index = inject(JournalsIndex);
  readonly #cycle = inject(CycleService);
  readonly #flows = inject(Flows);
  readonly #suggests = inject(SuggestService);
  readonly #workspace = inject(WorkspaceService);

  execute(p: OpenDateParameters): AsyncResult<OpenDateResult, OpenDateError> {
    const all = [...this.#journals.find().ids()];
    const { journalNames } = p;
    const candidates = journalNames ? all.filter((n) => journalNames.includes(n)) : all;
    const date = CalendarDate.fromAnchor(p.anchor);
    // The date is wherever the caller pointed — a day cell, today, a nav row in a daily note —
    // while each journal answers for the period of its own granularity containing it. Resolve
    // per journal before any entry is read or written by it: a weekly journal handed a
    // mid-week day would otherwise store that day as the entry's identity, which parseEntry
    // rejects as non-canonical, and look up an existing entry under an anchor it never owns.
    const applicable = candidates.flatMap((name) => {
      const resolved = this.#cycle.anchorOf(name, date);
      if (resolved.isNone()) return [];
      const anchor = resolved.value;
      if (!this.#timeline.contains(name, anchor)) return [];
      if (p.existingOnly && this.#index.entryByAnchor(name, anchor).isNone()) return [];
      return [{ name, anchor }];
    });

    if (applicable.length === 0) {
      return AsyncResult.err(new NoApplicableJournals(p.anchor, p.journalNames));
    }
    if (applicable.length === 1) {
      const [only] = applicable;
      if (only === undefined) {
        return AsyncResult.err(new NoApplicableJournals(p.anchor, p.journalNames));
      }
      return this.#flows.invoke(OpenJournalEntryFlow, {
        journalName: only.name,
        anchor: only.anchor,
        openMode: p.openMode,
      });
    }

    const names = applicable.map((entry) => entry.name);
    return AsyncResult.fromPromise(
      (async (): Promise<OpenDateResult> => {
        const choice = p.pickAt
          ? await this.#workspace.pickFromMenu(names, p.pickAt)
          : await this.#suggests.open(journalPickerSuggest, names);
        if (choice.isErr()) throw new UserAborted("journal-picker");
        const chosen = applicable.find((entry) => entry.name === choice.value);
        if (chosen === undefined) throw new NoApplicableJournals(p.anchor, p.journalNames);
        const dispatched = await this.#flows.invoke(OpenJournalEntryFlow, {
          journalName: chosen.name,
          anchor: chosen.anchor,
          openMode: p.openMode,
        });
        if (dispatched.isErr()) throw dispatched.error;
        return dispatched.value;
      })(),
      (cause) => cause as OpenDateError,
    );
  }
}
