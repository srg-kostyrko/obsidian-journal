import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, AsyncResult, Err } from "@/infrastructure/result";
import { toFlowError, UnknownJournalError } from "@/journals/errors";
import { noteletTypeDefaults, type TypeId } from "@/journals/notelets/config";
import { NoteletCommandService } from "@/journals/notelets/notelet-commands";
import { JournalsRepository } from "@/journals/repository";
import { SettingsUiService } from "@/settings";

import { addNoteletTypeModal } from "../ui/modals";
import { noteletTypeSubpage } from "../ui/notelet-type-subpage";

export class AddNoteletTypeFlow implements Flow<{ journalName: string }, { typeId: TypeId }, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #repository = inject(JournalsRepository);
  readonly #noteletCommands = inject(NoteletCommandService);
  readonly #ui = inject(SettingsUiService);

  execute(parameters: { journalName: string }): AsyncResult<{ typeId: TypeId }, FlowError> {
    if (this.#repository.get(parameters.journalName).isNone()) {
      return AsyncResult.err(toFlowError(new UnknownJournalError(parameters.journalName)));
    }
    return attempt.in(this, async function* (this: AddNoteletTypeFlow) {
      const submitted = yield* this.#modals
        .open(addNoteletTypeModal, { journalName: parameters.journalName })
        .mapErr(() => new UserAborted("add-notelet-type-modal"));

      // Re-read across the await: the journal may be gone by the time the modal closes, and a
      // spread of the stale record would resurrect every type it held.
      const config = this.#repository.get(parameters.journalName).getOrUndefined();
      if (config === undefined) {
        return yield* new Err(toFlowError(new UnknownJournalError(parameters.journalName)));
      }

      const typeId = crypto.randomUUID() as TypeId;
      const type = { ...noteletTypeDefaults(typeId), name: submitted.name };
      yield* this.#repository.addNoteletType(parameters.journalName, type).mapErr(toFlowError);
      this.#noteletCommands.seed(parameters.journalName, type);

      this.#ui.push(noteletTypeSubpage, { journalName: parameters.journalName, typeId });
      return { typeId };
    });
  }
}
