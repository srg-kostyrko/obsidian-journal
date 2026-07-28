import { datePickerModal } from "@/calendar/ui/modals";
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow } from "@/infrastructure/flows";
import { SuggestService, WorkspaceService } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";

import { JournalNotFoundError } from "../../errors";
import { pickingForWrite } from "../../picking";
import { JournalsRepository } from "../../repository";
import { TimelineService } from "../../timeline";
import { journalPickerSuggest } from "../journal-picker";
import { NotePathService } from "../note-path";

type InsertJournalLinkError = UserAborted | JournalNotFoundError;

export class InsertJournalLinkFlow implements Flow<void, void, InsertJournalLinkError> {
  readonly #suggests = inject(SuggestService);
  readonly #modals = inject(ModalService);
  readonly #journals = inject(JournalsRepository);
  readonly #path = inject(NotePathService);
  readonly #workspace = inject(WorkspaceService);
  readonly #timeline = inject(TimelineService);

  execute(): AsyncResult<void, InsertJournalLinkError> {
    return attempt.in(this, async function* (this: InsertJournalLinkFlow) {
      const names = [...this.#journals.find().ids()];
      const [only] = names;
      const journalName =
        names.length === 1 && only !== undefined
          ? only
          : yield* this.#suggests
              .open(journalPickerSuggest, names)
              .mapErr(() => new UserAborted("insert-journal-link"));

      const config = yield* this.#journals.get(journalName).okOrElse(() => new JournalNotFoundError(journalName));
      const period = yield* this.#modals
        .open(datePickerModal, {
          picking: pickingForWrite(config.write),
          bounds: this.#timeline.boundsOf(journalName),
        })
        .mapErr(() => new UserAborted("insert-journal-link"));

      const path = yield* this.#path.pathForDate(journalName, period.anchor);
      this.#workspace.insertNoteLinkAtCursor(path);
      return;
    });
  }
}
