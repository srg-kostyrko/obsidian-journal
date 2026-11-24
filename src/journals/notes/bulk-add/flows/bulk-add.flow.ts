import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow } from "@/infrastructure/flows";
import type { FolderNotFoundError } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt } from "@/infrastructure/result";

import { BulkAddService } from "../bulk-add-service";
import { configureBulkAddModal, processBulkAddModal } from "../ui/modals";

import type { JournalDateFormatError } from "../../errors";

export class BulkAddFlow implements Flow<
  { journalName: string },
  void,
  FolderNotFoundError | JournalDateFormatError | UserAborted
> {
  readonly #modals = inject(ModalService);
  readonly #service = inject(BulkAddService);

  execute(parameters: {
    journalName: string;
  }): AsyncResult<void, FolderNotFoundError | JournalDateFormatError | UserAborted> {
    // Ahead of attempt.in, so the configure modal still opens synchronously on the happy path.
    const renders = this.#service.checkRenders(parameters.journalName);
    if (renders.isErr()) return AsyncResult.err(renders.error);
    return attempt.in(this, async function* (this: BulkAddFlow) {
      const configured = yield* this.#modals
        .open(configureBulkAddModal, { journalName: parameters.journalName })
        .mapErr(() => new UserAborted("bulk-add-configure-modal"));

      const plan = yield* this.#service.plan(parameters.journalName, configured);

      yield* this.#modals
        .open(processBulkAddModal, { journalName: parameters.journalName, plan, parameters: configured })
        .mapErr(() => new UserAborted("bulk-add-process-modal"));
      return;
    });
  }
}
