import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";

import { editJournalTasksModal } from "../ui/modals";

export interface EditJournalTasksParameters {
  readonly journalName: string;
}

export class EditJournalTasksFlow implements Flow<EditJournalTasksParameters, void, FlowError> {
  readonly #modals = inject(ModalService);

  execute(parameters: EditJournalTasksParameters): AsyncResult<void, FlowError> {
    return attempt.in(this, async function* (this: EditJournalTasksFlow) {
      yield* this.#modals
        .open(editJournalTasksModal, { journalName: parameters.journalName })
        .mapErr(() => new UserAborted("edit-journal-tasks"));
    });
  }
}
