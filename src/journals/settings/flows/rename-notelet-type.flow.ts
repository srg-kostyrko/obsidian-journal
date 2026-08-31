import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt, Err } from "@/infrastructure/result";
import { toFlowError, UnknownJournalError } from "@/journals/errors";
import { NoteConnectionService } from "@/journals/notes/note-connection";
import { JournalsRepository } from "@/journals/repository";

import { renameNoteletTypeModal } from "../ui/modals";

export class RenameNoteletTypeFlow implements Flow<
  { journalName: string; typeId: string },
  { newName: string },
  FlowError
> {
  readonly #modals = inject(ModalService);
  readonly #repository = inject(JournalsRepository);
  readonly #connection = inject(NoteConnectionService);

  execute(parameters: { journalName: string; typeId: string }): AsyncResult<{ newName: string }, FlowError> {
    const configOpt = this.#repository.get(parameters.journalName);
    if (configOpt.isNone()) {
      return AsyncResult.err(toFlowError(new UnknownJournalError(parameters.journalName)));
    }
    const currentName = configOpt.value.notelets[parameters.typeId]?.name;
    if (currentName === undefined) {
      return AsyncResult.err(toFlowError(new UnknownJournalError(parameters.journalName)));
    }
    return attempt.in(this, async function* (this: RenameNoteletTypeFlow) {
      const submitted = yield* this.#modals
        .open(renameNoteletTypeModal, {
          journalName: parameters.journalName,
          typeId: parameters.typeId,
          currentName,
        })
        .mapErr(() => new UserAborted("rename-notelet-type-modal"));

      // Re-read across the await: the journal or the type may be gone by the time the modal
      // closes, and a spread of the stale value would resurrect it as a partial object.
      const config = this.#repository.get(parameters.journalName).getOrUndefined();
      const type = config?.notelets[parameters.typeId];
      if (config === undefined || type === undefined) {
        return yield* new Err(toFlowError(new UnknownJournalError(parameters.journalName)));
      }

      // type.name is read from the re-read config above, before this update — it is still the
      // old name. Capture it now so the rename call below doesn't need the reader to reason
      // about ordering.
      const oldName = type.name;
      this.#repository.update(parameters.journalName, {
        notelets: { ...config.notelets, [parameters.typeId]: { ...type, name: submitted.newName } },
      });
      // The stored type name is the reference parseEntry resolves by, so notelets written under
      // the old one have to move with it or they orphan.
      yield* this.#connection.renameNoteletTypeAll(parameters.journalName, oldName, submitted.newName);
      return { newName: submitted.newName };
    });
  }
}
