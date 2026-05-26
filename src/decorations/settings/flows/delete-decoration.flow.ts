import { toDecorationFlowError, UnknownDecorationError, type JournalDecoration } from "@/decorations";
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, AsyncResult } from "@/infrastructure/result";
import { toJournalFlowError, UnknownJournalError } from "@/journals";
import { JournalsRepository } from "@/journals/repository";

import { deleteDecorationModal } from "../ui/modals";

export class DeleteDecorationFlow implements Flow<
  { journalName: string; index: number },
  { deleted: JournalDecoration },
  FlowError
> {
  readonly #modals = inject(ModalService);
  readonly #repository = inject(JournalsRepository);

  execute(parameters: { journalName: string; index: number }): AsyncResult<{ deleted: JournalDecoration }, FlowError> {
    const configOption = this.#repository.get(parameters.journalName);
    if (configOption.isNone()) {
      return AsyncResult.err(toJournalFlowError(new UnknownJournalError(parameters.journalName)));
    }
    const config = configOption.getOr(undefined as never);
    if (parameters.index < 0 || parameters.index >= config.decorations.length) {
      return AsyncResult.err(
        toDecorationFlowError(new UnknownDecorationError(parameters.journalName, parameters.index)),
      );
    }
    const deleted = config.decorations[parameters.index];
    return attempt.in(this, async function* (this: DeleteDecorationFlow) {
      yield* this.#modals
        .open(deleteDecorationModal, { journalName: parameters.journalName })
        .mapErr(() => new UserAborted("delete-decoration-modal"));
      const next = config.decorations.filter((_, i) => i !== parameters.index);
      this.#repository.update(parameters.journalName, { decorations: next });
      return { deleted };
    });
  }
}
