import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";
import { SettingsUiService } from "@/settings";

import { toFlowError } from "../errors";
import { JournalLifecycleService } from "../lifecycle";
import { deleteJournalModal } from "../ui/delete-journal-modal";

export class DeleteJournalFlow implements Flow<{ journalName: string }, void, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #lifecycle = inject(JournalLifecycleService);
  readonly #ui = inject(SettingsUiService);

  execute(parameters: { journalName: string }): AsyncResult<void, FlowError> {
    return attempt.in(this, async function* (this: DeleteJournalFlow) {
      yield* this.#modals
        .open(deleteJournalModal, { journalName: parameters.journalName })
        .mapErr(() => new UserAborted("delete-journal-modal"));
      yield* this.#lifecycle.delete(parameters.journalName).mapErr(toFlowError);
      const current = this.#ui.current.value;
      if (
        current?.subpage.key === "journal-edit" &&
        (current.props as { journalName: string }).journalName === parameters.journalName
      ) {
        this.#ui.pop();
      }
      return;
    });
  }
}
