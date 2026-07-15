import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { Flows, UserAborted } from "@/infrastructure/flows";
import type { Flow } from "@/infrastructure/flows";
import { SuggestService, WorkspaceService } from "@/infrastructure/host";
import type { OpenMode, VaultPath, WorkspaceOpenError } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";

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
  readonly #flows = inject(Flows);
  readonly #suggests = inject(SuggestService);
  readonly #workspace = inject(WorkspaceService);

  execute(p: OpenDateParameters): AsyncResult<OpenDateResult, OpenDateError> {
    const all = [...this.#journals.find().ids()];
    const { journalNames } = p;
    const candidates = journalNames ? all.filter((n) => journalNames.includes(n)) : all;
    const applicable = candidates.filter((name) => {
      if (!this.#timeline.contains(name, p.anchor)) return false;
      return !(p.existingOnly && this.#index.entryByAnchor(name, p.anchor).isNone());
    });

    if (applicable.length === 0) {
      return AsyncResult.err(new NoApplicableJournals(p.anchor, p.journalNames));
    }
    if (applicable.length === 1) {
      const [name] = applicable;
      if (name === undefined) {
        return AsyncResult.err(new NoApplicableJournals(p.anchor, p.journalNames));
      }
      return this.#flows.invoke(OpenJournalEntryFlow, {
        journalName: name,
        anchor: p.anchor,
        openMode: p.openMode,
      });
    }

    return AsyncResult.fromPromise(
      (async (): Promise<OpenDateResult> => {
        const choice = p.pickAt
          ? await this.#workspace.pickFromMenu([...applicable], p.pickAt)
          : await this.#suggests.open(journalPickerSuggest, [...applicable]);
        if (choice.isErr()) throw new UserAborted("journal-picker");
        const dispatched = await this.#flows.invoke(OpenJournalEntryFlow, {
          journalName: choice.value,
          anchor: p.anchor,
          openMode: p.openMode,
        });
        if (dispatched.isErr()) throw dispatched.error;
        return dispatched.value;
      })(),
      (cause) => cause as OpenDateError,
    );
  }
}
