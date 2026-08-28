import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt } from "@/infrastructure/result";
import { toFlowError, UnknownJournalError, type JournalLifecycleFlowError } from "@/journals/errors";
import { NotePathService } from "@/journals/notes/note-path";
import { JournalsRepository } from "@/journals/repository";

import { promptAnswersModal } from "../ui/modals";

import type { PromptAnswer } from "../config";

export type GatherPromptAnswersError = UserAborted | JournalLifecycleFlowError;

export class GatherPromptAnswersFlow implements Flow<
  { journalName: string; anchor: AnchorString; confirming: boolean },
  Record<string, PromptAnswer>,
  GatherPromptAnswersError
> {
  readonly #modals = inject(ModalService);
  readonly #repository = inject(JournalsRepository);
  readonly #paths = inject(NotePathService);

  execute(parameters: {
    journalName: string;
    anchor: AnchorString;
    confirming: boolean;
  }): AsyncResult<Record<string, PromptAnswer>, GatherPromptAnswersError> {
    const config = this.#repository.get(parameters.journalName);
    if (config.isNone()) {
      return AsyncResult.err(toFlowError(new UnknownJournalError(parameters.journalName)));
    }
    const periodLabel = this.#paths.periodLabelFor(config.value, {
      journalName: parameters.journalName,
      anchor: parameters.anchor,
    });

    return attempt.in(this, async function* (this: GatherPromptAnswersFlow) {
      return yield* this.#modals
        .open(promptAnswersModal, {
          journalName: parameters.journalName,
          anchor: parameters.anchor,
          confirming: parameters.confirming,
          periodLabel,
        })
        .mapErr(() => new UserAborted("prompt-answers"));
    });
  }
}
