import { CalendarDate } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { Flows, UserAborted } from "@/infrastructure/flows";
import type { Flow } from "@/infrastructure/flows";
import type { OpenMode, VaultPath, WorkspaceOpenError } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";

import { NoApplicableJournals } from "../notes/errors";

import { JournalDateResolver } from "./journal-date-resolver";
import { OpenJournalEntryFlow } from "./open-journal-entry.flow";

import type { NoteCreationError } from "../notes/note-creation";

export interface OpenDateParameters {
  anchor: AnchorString;
  journalNames?: readonly string[];
  openMode?: OpenMode;
  existingOnly?: boolean;
  // The originating mouse event, when there is one: multi-journal disambiguation then
  // shows a menu at the pointer instead of the centered suggest.
  pickAt?: MouseEvent;
}

export interface OpenDateResult {
  path: VaultPath;
  created: boolean;
}

export type OpenDateError = NoApplicableJournals | NoteCreationError | WorkspaceOpenError | UserAborted;

export class OpenDateFlow implements Flow<OpenDateParameters, OpenDateResult, OpenDateError> {
  readonly #resolver = inject(JournalDateResolver);
  readonly #flows = inject(Flows);

  execute(p: OpenDateParameters): AsyncResult<OpenDateResult, OpenDateError> {
    const date = CalendarDate.fromAnchor(p.anchor);
    const applicable = this.#resolver.applicable(date, p.journalNames, p.existingOnly ?? false);

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
        const choice = await this.#resolver.pick(names, p.pickAt);
        if (choice === null) throw new UserAborted("journal-picker");
        const chosen = applicable.find((entry) => entry.name === choice);
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
