import { cloneFnJSON } from "@vueuse/core";

import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";

import { toFlowError } from "../errors";
import { ViewsService } from "../service";
import { ViewBlockDefinitionToken } from "../tokens";
import { addBlockPickerModal, editBlockModal } from "../ui/modals";

import type { ViewId } from "../config";

export class AddBlockToViewFlow implements Flow<{ viewId: ViewId }, void, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #views = inject(ViewsService);
  readonly #definitions = inject(ViewBlockDefinitionToken);

  execute(parameters: { viewId: ViewId }): AsyncResult<void, FlowError> {
    return attempt.in(this, async function* (this: AddBlockToViewFlow) {
      const key = yield* this.#modals
        .open(addBlockPickerModal, { definitions: this.#definitions })
        .mapErr(() => new UserAborted("add-block-picker-modal"));
      const blockId = yield* this.#views.addBlock(parameters.viewId, key).mapErr(toFlowError);

      const definition = this.#definitions.find((d) => d.key === key);
      if (!definition?.configComponent) return;

      // Cancelling only declines the initial configuration; the block stays with its defaults so an
      // accidental dismissal does not discard what the user just added.
      const submitted = await this.#modals
        .open(editBlockModal, {
          component: definition.configComponent,
          config: cloneFnJSON(definition.defaultConfig as Record<string, unknown>),
          typeLabel: definition.label(),
        })
        .match<Record<string, unknown> | null>({ ok: (next) => next, err: () => null });
      if (submitted === null) return;

      yield* this.#views.updateBlockConfig(parameters.viewId, blockId, submitted).mapErr(toFlowError);
    });
  }
}
