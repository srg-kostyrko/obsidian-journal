import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";

import { toFlowError } from "../errors";
import { ViewsService } from "../service";
import { viewNameModal } from "../ui/modals";
import { ViewsViewModel } from "../view-model";

import type { ViewId } from "../config";

export interface EditViewNameParameters {
  readonly viewId?: ViewId;
}

export class EditViewNameFlow implements Flow<EditViewNameParameters, { viewId: ViewId }, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #views = inject(ViewsService);
  readonly #vm = inject(ViewsViewModel);

  execute(parameters: EditViewNameParameters): AsyncResult<{ viewId: ViewId }, FlowError> {
    return attempt.in(this, async function* (this: EditViewNameFlow) {
      const currentName =
        parameters.viewId === undefined
          ? undefined
          : this.#vm
              .getView(parameters.viewId)
              .map((v) => v.name)
              .getOrUndefined();
      const name = yield* this.#modals
        .open(viewNameModal, { currentName })
        .mapErr(() => new UserAborted("view-name-modal"));
      if (parameters.viewId === undefined) {
        const id = yield* this.#views.create({ name }).mapErr(toFlowError);
        return { viewId: id };
      }
      const viewId = parameters.viewId;
      yield* this.#views.update(viewId, { name }).mapErr(toFlowError);
      return { viewId };
    });
  }
}
