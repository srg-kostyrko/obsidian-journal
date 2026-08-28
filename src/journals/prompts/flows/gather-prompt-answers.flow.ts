import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt } from "@/infrastructure/result";
import { toFlowError, UnknownJournalError } from "@/journals/errors";
import { JournalsRepository } from "@/journals/repository";

import { promptAnswersModal } from "../ui/modals";

import type { PromptAnswer } from "../config";

export class GatherPromptAnswersFlow implements Flow<
  { journalName: string; anchor: AnchorString; confirming: boolean },
  Record<string, PromptAnswer>,
  FlowError
> {
  readonly #modals = inject(ModalService);
  readonly #repository = inject(JournalsRepository);

  execute(parameters: {
    journalName: string;
    anchor: AnchorString;
    confirming: boolean;
  }): AsyncResult<Record<string, PromptAnswer>, FlowError> {
    if (this.#repository.get(parameters.journalName).isNone()) {
      return AsyncResult.err(toFlowError(new UnknownJournalError(parameters.journalName)));
    }

    return attempt.in(this, async function* (this: GatherPromptAnswersFlow) {
      return yield* this.#modals
        .open(promptAnswersModal, {
          journalName: parameters.journalName,
          anchor: parameters.anchor,
          confirming: parameters.confirming,
        })
        .mapErr(() => new UserAborted("prompt-answers"));
    });
  }
}
