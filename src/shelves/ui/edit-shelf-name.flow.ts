import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";

import { toFlowError } from "../errors";
import { ShelvesRepository } from "../repository";

import { shelfNameModal } from "./modals";

export interface EditShelfNameParameters {
  readonly shelfName?: string;
}

export class EditShelfNameFlow implements Flow<EditShelfNameParameters, { shelfName: string }, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #repo = inject(ShelvesRepository);

  execute(parameters: EditShelfNameParameters): AsyncResult<{ shelfName: string }, FlowError> {
    const takenNames = [...this.#repo.find().ids()].filter((name) => name !== parameters.shelfName);
    return attempt.in(this, async function* (this: EditShelfNameFlow) {
      const name = yield* this.#modals
        .open(shelfNameModal, { currentName: parameters.shelfName, takenNames })
        .mapErr(() => new UserAborted("shelf-name-modal"));
      yield* (
        parameters.shelfName === undefined ? this.#repo.create(name) : this.#repo.rename(parameters.shelfName, name)
      ).mapErr(toFlowError);
      return { shelfName: name };
    });
  }
}
