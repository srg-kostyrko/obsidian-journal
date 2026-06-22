import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt } from "@/infrastructure/result";
import { toFlowError, UnknownJournalError, UnknownSequenceSourceError } from "@/journals/errors";
import { JournalsRepository } from "@/journals/repository";

import { editSequencePropertyModal } from "../ui/modals";

export class EditSequencePropertyFlow implements Flow<
  { journalName: string; sourceIndex: number },
  { newValue: string },
  FlowError
> {
  readonly #modals = inject(ModalService);
  readonly #repository = inject(JournalsRepository);

  execute(parameters: { journalName: string; sourceIndex: number }): AsyncResult<{ newValue: string }, FlowError> {
    const configOpt = this.#repository.get(parameters.journalName);
    if (configOpt.isNone()) {
      return AsyncResult.err(toFlowError(new UnknownJournalError(parameters.journalName)));
    }
    const config = configOpt.getOr(undefined as never);
    if (config.numbering.sources.at(parameters.sourceIndex) === undefined) {
      return AsyncResult.err(
        toFlowError(new UnknownSequenceSourceError(parameters.journalName, parameters.sourceIndex)),
      );
    }
    return attempt.in(this, async function* (this: EditSequencePropertyFlow) {
      const submitted = yield* this.#modals
        .open(editSequencePropertyModal, {
          journalName: parameters.journalName,
          sourceIndex: parameters.sourceIndex,
        })
        .mapErr(() => new UserAborted("edit-sequence-property-modal"));
      const updatedSources = config.numbering.sources.map((s, i) =>
        i === parameters.sourceIndex ? { ...s, frontmatterKey: submitted.newValue } : s,
      );
      this.#repository.update(parameters.journalName, {
        numbering: { ...config.numbering, sources: updatedSources },
      });
      return { newValue: submitted.newValue };
    });
  }
}
