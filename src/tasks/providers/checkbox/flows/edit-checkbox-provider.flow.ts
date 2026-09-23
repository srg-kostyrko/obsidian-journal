import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";

import { editCheckboxProviderModal } from "../ui/modals";

export class EditCheckboxProviderFlow implements Flow<Record<string, never>, void, FlowError> {
  readonly #modals = inject(ModalService);

  execute(): AsyncResult<void, FlowError> {
    return attempt.in(this, async function* (this: EditCheckboxProviderFlow) {
      yield* this.#modals.open(editCheckboxProviderModal, {}).mapErr(() => new UserAborted("edit-checkbox-provider"));
    });
  }
}
