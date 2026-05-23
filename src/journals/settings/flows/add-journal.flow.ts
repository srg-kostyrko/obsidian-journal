import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";
import { toFlowError } from "@/journals/errors";
import { SettingsUiService } from "@/settings";

import { JournalLifecycleService } from "../lifecycle";
import { addJournalModal } from "../ui/add-journal-modal";
import { journalEditSubpage } from "../ui/journals-subpage";

export class AddJournalFlow implements Flow<void, { name: string }, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #lifecycle = inject(JournalLifecycleService);
  readonly #ui = inject(SettingsUiService);

  execute(): AsyncResult<{ name: string }, FlowError> {
    return attempt.in(this, async function* (this: AddJournalFlow) {
      const submitted = yield* this.#modals
        .open(addJournalModal, void 0)
        .mapErr(() => new UserAborted("add-journal-modal"));
      yield* this.#lifecycle.create(submitted.name, submitted.write).mapErr(toFlowError);
      this.#ui.push(journalEditSubpage, { journalName: submitted.name });
      return { name: submitted.name };
    });
  }
}
