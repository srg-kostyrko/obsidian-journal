import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt } from "@/infrastructure/result";
import { toFlowError, UnknownJournalError, type JournalLifecycleFlowError } from "@/journals/errors";
import { FrontmatterService } from "@/journals/frontmatter";
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
  readonly #frontmatter = inject(FrontmatterService);

  execute(parameters: {
    journalName: string;
    anchor: AnchorString;
    confirming: boolean;
  }): AsyncResult<Record<string, PromptAnswer>, GatherPromptAnswersError> {
    // Metadata is built rather than assembled from the two parameters: the assigned numbers and
    // any stored end date belong to the period, and the modal previews the note name from them.
    // Both lookups answer the same question, so one guard covers them.
    const config = this.#repository.get(parameters.journalName);
    const metadata = this.#frontmatter.buildMetadata(parameters.journalName, parameters.anchor);
    if (config.isNone() || metadata.isErr()) {
      return AsyncResult.err(toFlowError(new UnknownJournalError(parameters.journalName)));
    }
    const periodLabel = this.#paths.periodLabelFor(config.value, metadata.value);

    return attempt.in(this, async function* (this: GatherPromptAnswersFlow) {
      return yield* this.#modals
        .open(promptAnswersModal, {
          metadata: metadata.value,
          confirming: parameters.confirming,
          periodLabel,
        })
        .mapErr(() => new UserAborted("prompt-answers"));
    });
  }
}
