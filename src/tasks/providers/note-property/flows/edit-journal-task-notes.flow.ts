import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";

import { editJournalTaskNotesModal } from "../ui/modals";

export interface EditJournalTaskNotesParameters {
  readonly journalName: string;
}

export class EditJournalTaskNotesFlow implements Flow<EditJournalTaskNotesParameters, void, FlowError> {
  readonly #modals = inject(ModalService);

  execute(parameters: EditJournalTaskNotesParameters): AsyncResult<void, FlowError> {
    return attempt.in(this, async function* (this: EditJournalTaskNotesFlow) {
      yield* this.#modals
        .open(editJournalTaskNotesModal, { journalName: parameters.journalName })
        .mapErr(() => new UserAborted("edit-journal-task-notes"));
    });
  }
}
