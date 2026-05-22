import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { shelvesCollection } from "../config";
import { toFlowError } from "../errors";
import { ShelvesLifecycleService } from "../lifecycle";

import { deleteShelfModal } from "./delete-shelf-modal";

export class DeleteShelfFlow implements Flow<{ shelfName: string }, void, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #lifecycle = inject(ShelvesLifecycleService);
  readonly #settings = inject(SettingsService);

  execute(parameters: { shelfName: string }): AsyncResult<void, FlowError> {
    const collection = this.#settings.getCollection(shelvesCollection);
    const otherShelves = Object.keys(collection.entries).filter((name) => name !== parameters.shelfName);
    return attempt.in(this, async function* (this: DeleteShelfFlow) {
      const destination = yield* this.#modals
        .open(deleteShelfModal, { shelfName: parameters.shelfName, otherShelves })
        .mapErr(() => new UserAborted("delete-shelf-modal"));
      yield* this.#lifecycle.delete(parameters.shelfName, destination).mapErr(toFlowError);
      return;
    });
  }
}
