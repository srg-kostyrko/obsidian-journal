import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { shelvesCollection } from "../config";
import { toFlowError } from "../errors";
import { ShelvesLifecycleService } from "../lifecycle";

import { shelfNameModal } from "./shelf-name-modal";

export interface EditShelfNameParameters {
  readonly shelfName?: string;
}

export class EditShelfNameFlow implements Flow<EditShelfNameParameters, { shelfName: string }, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #lifecycle = inject(ShelvesLifecycleService);
  readonly #settings = inject(SettingsService);

  execute(parameters: EditShelfNameParameters): AsyncResult<{ shelfName: string }, FlowError> {
    const collection = this.#settings.getCollection(shelvesCollection);
    const takenNames = Object.keys(collection.entries).filter((name) => name !== parameters.shelfName);
    return attempt.in(this, async function* (this: EditShelfNameFlow) {
      const name = yield* this.#modals
        .open(shelfNameModal, { currentName: parameters.shelfName, takenNames })
        .mapErr(() => new UserAborted("shelf-name-modal"));
      yield* (
        parameters.shelfName === undefined
          ? this.#lifecycle.create(name)
          : this.#lifecycle.rename(parameters.shelfName, name)
      ).mapErr(toFlowError);
      return { shelfName: name };
    });
  }
}
