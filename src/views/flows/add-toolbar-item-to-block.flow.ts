import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";

import { toFlowError } from "../errors";
import { ViewsService } from "../service";
import { ToolbarItemDefinitionToken } from "../tokens";
import { addToolbarItemPickerModal, editToolbarItemModal } from "../ui/modals";

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
      const defaultConfig = choice.defaultConfig as Record<string, unknown> | undefined;
      const itemId = yield* this.#views
        .addToolbarItem(p.viewId, p.blockId, choice.key, defaultConfig)
        .mapErr(toFlowError);
      if (itemId === null) return;

      const definition = this.#definitions.find((d) => d.key === choice.key);
      if (!definition?.configComponent) return;

      const seed = defaultConfig ?? (definition.defaultConfig() as Record<string, unknown>);
      const submitted = await this.#modals
        .open(editToolbarItemModal, {
          component: definition.configComponent,
          config: seed,
          typeLabel: definition.label(),
          summary: definition.summary?.(seed),
        })
        .match<Record<string, unknown> | null>({ ok: (next) => next, err: () => null });
      if (submitted === null) return;

      yield* this.#views.updateToolbarItemConfig(p.viewId, p.blockId, itemId, submitted).mapErr(toFlowError);
    });
  }
}
