import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";

import { CommandsRepository } from "../repository";

import { deleteCommandModal } from "./modals";

export class DeleteCommandFlow implements Flow<{ commandId: string }, void, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #repo = inject(CommandsRepository);

  execute(parameters: { commandId: string }): AsyncResult<void, FlowError> {
    return attempt.in(this, async function* (this: DeleteCommandFlow) {
      yield* this.#modals
        .open(deleteCommandModal, {
          commandName: this.#repo.get(parameters.commandId).getOr(undefined as never)?.name ?? "",
        })
        .mapErr(() => new UserAborted("delete-command-modal"));
      this.#repo.delete(parameters.commandId);
      return;
    });
  }
}
