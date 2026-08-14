import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";

import { toFlowError } from "../errors";
import { ShelvesRepository } from "../repository";
import { deleteShelfModal } from "../ui/modals";

export class DeleteShelfFlow implements Flow<{ shelfName: string }, void, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #repo = inject(ShelvesRepository);

  execute(parameters: { shelfName: string }): AsyncResult<void, FlowError> {
    const otherShelves = [...this.#repo.find().ids()].filter((name) => name !== parameters.shelfName);
    return attempt.in(this, async function* (this: DeleteShelfFlow) {
      const destination = yield* this.#modals
        .open(deleteShelfModal, { shelfName: parameters.shelfName, otherShelves })
        .mapErr(() => new UserAborted("delete-shelf-modal"));
      yield* this.#repo.deleteWith(parameters.shelfName, destination || undefined).mapErr(toFlowError);
      return;
    });
  }
}
