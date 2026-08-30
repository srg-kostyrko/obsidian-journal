import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt, Err } from "@/infrastructure/result";
import { toFlowError, UnknownJournalError } from "@/journals/errors";
import { JournalsRepository } from "@/journals/repository";

import { renameNoteletTypeModal } from "../ui/modals";

export class RenameNoteletTypeFlow implements Flow<
  { journalName: string; typeId: string },
  { newName: string },
  FlowError
> {
  readonly #modals = inject(ModalService);
  readonly #repository = inject(JournalsRepository);

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

      // Notelets already written keep the old name in their frontmatter: rewriting them is the
      // cascade seam a later slice owns, not this rename.
      this.#repository.update(parameters.journalName, {
        notelets: { ...config.notelets, [parameters.typeId]: { ...type, name: submitted.newName } },
      });
      return { newName: submitted.newName };
    });
  }
}
