import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { shelvesCollection } from "../config";
import { toFlowError } from "../errors";
import { ShelvesLifecycleService } from "../lifecycle";

import { placeJournalModal } from "./place-journal-modal";

export class PlaceJournalFlow implements Flow<{ journalName: string }, void, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #lifecycle = inject(ShelvesLifecycleService);
  readonly #settings = inject(SettingsService);

  execute(parameters: { journalName: string }): AsyncResult<void, FlowError> {
    const shelves = this.#settings.getCollection(shelvesCollection);
    const shelfNames = Object.keys(shelves.entries);
    const currentShelf = shelfNames.find((name) => shelves.get(name)?.journals.includes(parameters.journalName)) ?? "";
    return attempt.in(this, async function* (this: PlaceJournalFlow) {
      const selected = yield* this.#modals
        .open(placeJournalModal, { currentShelf, shelfNames })
        .mapErr(() => new UserAborted("place-journal-modal"));
      yield* this.#lifecycle.assign(parameters.journalName, selected).mapErr(toFlowError);
      return;
    });
  }
}
