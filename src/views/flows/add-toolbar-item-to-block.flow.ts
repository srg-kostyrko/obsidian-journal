import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";

import { toFlowError } from "../errors";
import { ViewsService } from "../service";
import { ToolbarItemDefinitionToken } from "../tokens";
import { addToolbarItemPickerModal } from "../ui/modals";

import type { BlockInstanceId, ViewId } from "../config";

export interface AddToolbarItemParameters {
  readonly viewId: ViewId;
  readonly blockId: BlockInstanceId;
}

export class AddToolbarItemToBlockFlow implements Flow<AddToolbarItemParameters, void, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #views = inject(ViewsService);
  readonly #definitions = inject(ToolbarItemDefinitionToken);

  execute(p: AddToolbarItemParameters): AsyncResult<void, FlowError> {
    return attempt.in(this, async function* (this: AddToolbarItemToBlockFlow) {
      const choice = yield* this.#modals
        .open(addToolbarItemPickerModal, { definitions: this.#definitions })
        .mapErr(() => new UserAborted("add-toolbar-item-picker-modal"));
      yield* this.#views
        .addToolbarItem(p.viewId, p.blockId, choice.key, choice.defaultConfig as Record<string, unknown> | undefined)
        .mapErr(toFlowError);
    });
  }
}
