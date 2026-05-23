import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";
import { toFlowError } from "@/journals/errors";

import { JournalLifecycleService } from "../lifecycle";
import { renameJournalModal } from "../ui/rename-journal-modal";

export class RenameJournalFlow implements Flow<{ journalName: string }, { newName: string }, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #lifecycle = inject(JournalLifecycleService);

  execute(parameters: { journalName: string }): AsyncResult<{ newName: string }, FlowError> {
    return attempt.in(this, async function* (this: RenameJournalFlow) {
      const submitted = yield* this.#modals
        .open(renameJournalModal, { currentName: parameters.journalName })
        .mapErr(() => new UserAborted("rename-journal-modal"));
      yield* this.#lifecycle.rename(parameters.journalName, submitted.newName).mapErr(toFlowError);
      return { newName: submitted.newName };
    });
  }
}
