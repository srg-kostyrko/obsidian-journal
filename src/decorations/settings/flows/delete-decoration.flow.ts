import {
  DecorationsStore,
  toDecorationFlowError,
  UnknownDecorationError,
  UnknownDecorationOwnerError,
  type DecorationOwner,
  type JournalDecoration,
} from "@/decorations";
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, AsyncResult } from "@/infrastructure/result";

import { deleteDecorationModal } from "../ui/modals";

export class DeleteDecorationFlow implements Flow<
  { owner: DecorationOwner; index: number },
  { deleted: JournalDecoration },
  FlowError
> {
  readonly #modals = inject(ModalService);
  readonly #store = inject(DecorationsStore);

  execute(parameters: {
    owner: DecorationOwner;
    index: number;
  }): AsyncResult<{ deleted: JournalDecoration }, FlowError> {
    const { owner, index } = parameters;
    if (!this.#store.exists(owner)) {
      return AsyncResult.err(toDecorationFlowError(new UnknownDecorationOwnerError(owner)));
    }
    const decorations = this.#store.list(owner);
    if (index < 0 || index >= decorations.length) {
      return AsyncResult.err(toDecorationFlowError(new UnknownDecorationError(owner, index)));
    }
    const deleted = decorations[index];
    return attempt.in(this, async function* (this: DeleteDecorationFlow) {
      yield* this.#modals
        .open(deleteDecorationModal, { owner })
        .mapErr(() => new UserAborted("delete-decoration-modal"));
      this.#store.save(
        owner,
        decorations.filter((_, i) => i !== index),
      );
      return { deleted };
    });
  }
}
