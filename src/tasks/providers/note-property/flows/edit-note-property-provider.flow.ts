import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";

import { editNotePropertyProviderModal } from "../ui/modals";

export class EditNotePropertyProviderFlow implements Flow<Record<string, never>, void, FlowError> {
  readonly #modals = inject(ModalService);

  execute(): AsyncResult<void, FlowError> {
    return attempt.in(this, async function* (this: EditNotePropertyProviderFlow) {
      yield* this.#modals
        .open(editNotePropertyProviderModal, {})
        .mapErr(() => new UserAborted("edit-note-property-provider"));
    });
  }
}
