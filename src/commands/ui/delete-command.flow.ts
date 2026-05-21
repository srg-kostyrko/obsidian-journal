import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { commandCollection } from "../config";

import { deleteCommandModal } from "./delete-command-modal";

export class DeleteCommandFlow implements Flow<{ commandId: string }, void, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #settings = inject(SettingsService);

  execute(parameters: { commandId: string }): AsyncResult<void, FlowError> {
    const collection = this.#settings.getCollection(commandCollection);
    return attempt.in(this, async function* (this: DeleteCommandFlow) {
      yield* this.#modals
        .open(deleteCommandModal, { commandName: collection.get(parameters.commandId)?.name ?? "" })
        .mapErr(() => new UserAborted("delete-command-modal"));
      collection.remove(parameters.commandId);
      return;
    });
  }
}
