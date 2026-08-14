import { match } from "ts-pattern";

import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt } from "@/infrastructure/result";
import { toFlowError } from "@/journals/errors";
import { NoteConnectionService } from "@/journals/notes/note-connection";
import { JournalsRepository } from "@/journals/repository";
import { SettingsUiService } from "@/settings";

import { deleteJournalModal } from "../ui/modals";

export class DeleteJournalFlow implements Flow<{ journalName: string }, void, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #repository = inject(JournalsRepository);
  readonly #connection = inject(NoteConnectionService);
  readonly #ui = inject(SettingsUiService);

  execute(parameters: { journalName: string }): AsyncResult<void, FlowError> {
    return attempt.in(this, async function* (this: DeleteJournalFlow) {
      const { mode } = yield* this.#modals
        .open(deleteJournalModal, { journalName: parameters.journalName })
        .mapErr(() => new UserAborted("delete-journal-modal"));

      // Purge before deleting the config: disconnect resolves the journal's custom
      // frontmatter field names from its config, which is gone after repository.delete.
      yield* match(mode)
        .with("clear", () => this.#connection.disconnectAll(parameters.journalName))
        .with("delete", () => this.#connection.deleteAll(parameters.journalName))
        .with("keep", () => AsyncResult.ok())
        .exhaustive();

      yield* this.#repository.delete(parameters.journalName).mapErr(toFlowError);
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
