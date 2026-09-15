import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt } from "@/infrastructure/result";

import { ImportConnectService } from "../connect-service";
import { NothingToImport } from "../errors";
import { ImportService, type ImportOutcome } from "../import-service";
import { hasAnythingToImport, ImportPlanner } from "../planner";
import { importConnectModal, importPreviewModal } from "../ui/modals";

export class ImportFromPluginsFlow implements Flow<void, ImportOutcome, NothingToImport | UserAborted> {
  readonly #planner = inject(ImportPlanner);
  readonly #imports = inject(ImportService);
  readonly #connect = inject(ImportConnectService);
  readonly #modals = inject(ModalService);

  execute(): AsyncResult<ImportOutcome, NothingToImport | UserAborted> {
    const plan = this.#planner.plan();
    if (!hasAnythingToImport(plan)) {
      return AsyncResult.err(new NothingToImport());
    }
    return attempt.in(this, async function* (this: ImportFromPluginsFlow) {
      const selection = yield* this.#modals
        .open(importPreviewModal, { plan })
        .mapErr(() => new UserAborted("import-preview-modal"));
      const outcome = await this.#imports.apply(plan, selection);
      // Planned after apply() returns: the week start it applied re-anchors weekly notes on the
      // next tick, and connections must be read under the new grid.
      const connect = await this.#connect.plan(outcome);
      // The import already happened; closing the report does not undo it, so dismissing it is not
      // an abort.
      await this.#modals.open(importConnectModal, { outcome, connect });
      return outcome;
    });
  }
}
