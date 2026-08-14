import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";

import { toFlowError } from "../errors";
import { ShelvesRepository } from "../repository";
import { ShelvesService } from "../service";
import { placeJournalModal } from "../ui/modals";

export class PlaceJournalFlow implements Flow<{ journalName: string }, void, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #repo = inject(ShelvesRepository);
  readonly #service = inject(ShelvesService);

  execute(parameters: { journalName: string }): AsyncResult<void, FlowError> {
    const shelfNames = [...this.#repo.find().ids()];
    const currentShelf = this.#service.shelfOf(parameters.journalName);
    return attempt.in(this, async function* (this: PlaceJournalFlow) {
      const selected = yield* this.#modals
        .open(placeJournalModal, { currentShelf, shelfNames })
        .mapErr(() => new UserAborted("place-journal-modal"));
      yield* this.#service.assign(parameters.journalName, selected).mapErr(toFlowError);
      return;
    });
  }
}
