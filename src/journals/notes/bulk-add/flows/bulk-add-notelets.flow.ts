import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow } from "@/infrastructure/flows";
import type { FolderNotFoundError } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt } from "@/infrastructure/result";

import { JournalsRepository } from "../../../repository";
import { BulkAddService } from "../bulk-add-service";
import { configureBulkAddNoteletsModal, processBulkAddModal } from "../ui/modals";

import type { JournalDateFormatError } from "../../errors";

export class BulkAddNoteletsFlow implements Flow<
  { journalName: string; typeId: string },
  void,
  FolderNotFoundError | JournalDateFormatError | UserAborted
> {
  readonly #modals = inject(ModalService);
  readonly #service = inject(BulkAddService);
  readonly #journals = inject(JournalsRepository);

  execute(parameters: {
    journalName: string;
    typeId: string;
  }): AsyncResult<void, FolderNotFoundError | JournalDateFormatError | UserAborted> {
    // Ahead of attempt.in, so the configure modal still opens synchronously on the happy path.
    const renders = this.#service.checkRenders(parameters.journalName, parameters.typeId);
    if (renders.isErr()) return AsyncResult.err(renders.error);
    return attempt.in(this, async function* (this: BulkAddNoteletsFlow) {
      const typeName =
        this.#journals.get(parameters.journalName).getOrUndefined()?.notelets[parameters.typeId]?.name ?? "";
      const configured = yield* this.#modals
        .open(configureBulkAddNoteletsModal, { ...parameters, typeName })
        .mapErr(() => new UserAborted("bulk-add-notelets-configure-modal"));

      const plan = yield* this.#service.plan(parameters.journalName, configured);

      yield* this.#modals
        .open(processBulkAddModal, { journalName: parameters.journalName, plan, parameters: configured })
        .mapErr(() => new UserAborted("bulk-add-notelets-process-modal"));
      return;
    });
  }
}
