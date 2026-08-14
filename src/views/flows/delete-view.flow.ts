import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";

import { toFlowError } from "../errors";
import { ViewsService } from "../service";
import { deleteViewModal } from "../ui/modals";
import { ViewsViewModel } from "../view-model";

import type { ViewId } from "../config";

export class DeleteViewFlow implements Flow<{ viewId: ViewId }, void, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #views = inject(ViewsService);
  readonly #vm = inject(ViewsViewModel);

  execute(parameters: { viewId: ViewId }): AsyncResult<void, FlowError> {
    return attempt.in(this, async function* (this: DeleteViewFlow) {
      const viewName = this.#vm
        .getView(parameters.viewId)
        .map((v) => v.name)
        .getOr("");
      yield* this.#modals.open(deleteViewModal, { viewName }).mapErr(() => new UserAborted("delete-view-modal"));
      yield* this.#views.delete(parameters.viewId).mapErr(toFlowError);
    });
  }
}
