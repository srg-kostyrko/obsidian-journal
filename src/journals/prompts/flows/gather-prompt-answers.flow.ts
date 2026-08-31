import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt } from "@/infrastructure/result";
import { toFlowError, UnknownJournalError, type JournalLifecycleFlowError } from "@/journals/errors";
import { FrontmatterService } from "@/journals/frontmatter";
import { NotePathService } from "@/journals/notes/note-path";
import { JournalsRepository } from "@/journals/repository";
import type { JournalMetadata, NoteletMetadata } from "@/journals/types";

import { promptAnswersModal } from "../ui/modals";

import type { PromptAnswer } from "../config";

export type GatherPromptAnswersError = UserAborted | JournalLifecycleFlowError;

export interface GatherPromptAnswersParameters {
  metadata: JournalMetadata | NoteletMetadata;
  confirming: boolean;
}

export class GatherPromptAnswersFlow implements Flow<
  GatherPromptAnswersParameters,
  Record<string, PromptAnswer>,
  GatherPromptAnswersError
> {
  readonly #modals = inject(ModalService);
  readonly #repository = inject(JournalsRepository);
  readonly #paths = inject(NotePathService);
  readonly #frontmatter = inject(FrontmatterService);

  execute(
    parameters: GatherPromptAnswersParameters,
  ): AsyncResult<Record<string, PromptAnswer>, GatherPromptAnswersError> {
    const { journalName, anchor } = parameters.metadata;
    // The period label is the journal's, for either kind: a notelet is anchored to a period even
    // though it is not the period's note.
    const config = this.#repository.get(journalName);
    const period = this.#frontmatter.buildMetadata(journalName, anchor);
    if (config.isNone() || period.isErr()) {
      return AsyncResult.err(toFlowError(new UnknownJournalError(journalName)));
    }
    const periodLabel = this.#paths.periodLabelFor(config.value, period.value);

    return attempt.in(this, async function* (this: GatherPromptAnswersFlow) {
      return yield* this.#modals
        .open(promptAnswersModal, {
          metadata: parameters.metadata,
          confirming: parameters.confirming,
          periodLabel,
        })
        .mapErr(() => new UserAborted("prompt-answers"));
    });
  }
}
