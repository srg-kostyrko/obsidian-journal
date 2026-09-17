import { datePickerModal } from "@/calendar/ui/modals";
import { inject } from "@/infrastructure/di";
import { NotesService, SuggestService } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, Err, type AsyncResult } from "@/infrastructure/result";

import { JournalNotFoundError, type OutOfTimelineError } from "../errors";
import { journalPickerSuggest } from "../notes/journal-picker";
import { NotePathService } from "../notes/note-path";
import { pickingForWrite } from "../picking";
import { JournalsRepository } from "../repository";

import { JournalNoteLinkCancelledError, NamedByAnswersError } from "./errors";
import { promptsInPath } from "./prompts-in-path";

import type { EmptyNoteNameError } from "../notes/errors";

export type JournalNoteLinkError =
  JournalNoteLinkCancelledError | JournalNotFoundError | OutOfTimelineError | EmptyNoteNameError | NamedByAnswersError;

export class JournalNoteLinkPicker {
  readonly #suggests = inject(SuggestService);
  readonly #modals = inject(ModalService);
  readonly #journals = inject(JournalsRepository);
  readonly #paths = inject(NotePathService);
  readonly #notes = inject(NotesService);

  /** Asks for a journal and one of its periods, and answers the link text for that period's note. */
  pick(): AsyncResult<string, JournalNoteLinkError> {
    return attempt.in(this, async function* (this: JournalNoteLinkPicker) {
      const names = [...this.#journals.find().ids()];
      const [only] = names;
      const journalName =
        names.length === 1 && only !== undefined
          ? only
          : yield* this.#suggests.open(journalPickerSuggest, names).mapErr(() => new JournalNoteLinkCancelledError());

      const config = yield* this.#journals.get(journalName).okOrElse(() => new JournalNotFoundError(journalName));
      const period = yield* this.#modals
        .open(datePickerModal, { picking: pickingForWrite(config.write) })
        .mapErr(() => new JournalNoteLinkCancelledError());

      // Re-read across the await: the picker's granularity came from the write configuration
      // read before it opened, and a settings write landing while it was open (a sync merge, or
      // any other write reaching JournalsRepository) can swap that configuration for one with a
      // different granularity before the pick resolves — the same hazard RenameNoteletTypeFlow
      // and DeleteNoteletTypeFlow re-read for. Compare by value, since the stored config is a
      // reactive proxy a write can also just re-create, and treat a mismatch as a cancelled pick
      // rather than resolving the period the user saw against a granularity they never chose.
      const current = yield* this.#journals.get(journalName).okOrElse(() => new JournalNotFoundError(journalName));
      if (JSON.stringify(current.write) !== JSON.stringify(config.write)) {
        return yield* new Err(new JournalNoteLinkCancelledError());
      }

      const path = yield* this.#paths.linkTargetForDate(journalName, period.anchor);
      // An unanswered name renders the placeholder, so the link would point at a note that can never exist.
      if (this.#notes.find(path).isNone() && promptsInPath(current).length > 0) {
        return yield* new Err(new NamedByAnswersError(journalName));
      }
      return this.#notes.linkTextFor(path);
    });
  }
}
