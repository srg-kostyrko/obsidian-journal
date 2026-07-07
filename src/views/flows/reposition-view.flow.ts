import { match } from "ts-pattern";

import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";

import { repositionViewModal } from "../ui/modals";
import { ViewHostService } from "../view-host";
import { ViewsViewModel } from "../view-model";

import type { View, ViewId } from "../config";

export class RepositionViewFlow implements Flow<{ viewId: ViewId }, void, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #viewHost = inject(ViewHostService);
  readonly #vm = inject(ViewsViewModel);

  execute(parameters: { viewId: ViewId }): AsyncResult<void, FlowError> {
    return attempt.in(this, async function* (this: RepositionViewFlow) {
      if (!this.#viewHost.isOpen(parameters.viewId)) return;
      const leaf: View["leaf"] = this.#vm
        .getView(parameters.viewId)
        .map((view) => view.leaf)
        .getOr("right");
      const location = match(leaf)
        .with("left", () => m.view_edit_leaf_left())
        .with("right", () => m.view_edit_leaf_right())
        .with("tab", () => m.view_edit_leaf_tab())
        .exhaustive();
      yield* this.#modals
        .open(repositionViewModal, { location })
        .mapErr(() => new UserAborted("reposition-view-modal"));
      await this.#viewHost.reposition(parameters.viewId);
    });
  }
}
