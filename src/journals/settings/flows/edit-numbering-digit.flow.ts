import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt } from "@/infrastructure/result";
import { toFlowError, UnknownJournalError, UnknownSequenceSourceError } from "@/journals/errors";
import { NoteConnectionService } from "@/journals/notes/note-connection";
import { JournalsRepository } from "@/journals/repository";

import { editNumberingDigitModal } from "../ui/modals";

export class EditNumberingDigitFlow implements Flow<
  { journalName: string; sourceIndex?: number },
  { variable: string },
  FlowError
> {
  readonly #modals = inject(ModalService);
  readonly #repository = inject(JournalsRepository);
  readonly #connection = inject(NoteConnectionService);

  execute(parameters: { journalName: string; sourceIndex?: number }): AsyncResult<{ variable: string }, FlowError> {
    const configOpt = this.#repository.get(parameters.journalName);
    if (configOpt.isNone()) {
      return AsyncResult.err(toFlowError(new UnknownJournalError(parameters.journalName)));
    }
    const config = configOpt.value;
    const sourceIndex = parameters.sourceIndex;
    if (sourceIndex !== undefined && config.numbering.sources.at(sourceIndex) === undefined) {
      return AsyncResult.err(toFlowError(new UnknownSequenceSourceError(parameters.journalName, sourceIndex)));
    }
    return attempt.in(this, async function* (this: EditNumberingDigitFlow) {
      const digit = yield* this.#modals
        .open(editNumberingDigitModal, { journalName: parameters.journalName, sourceIndex })
        .mapErr(() => new UserAborted("edit-numbering-digit-modal"));

      const oldKey = sourceIndex === undefined ? undefined : config.numbering.sources[sourceIndex]?.frontmatterKey;
      const updatedSources =
        sourceIndex === undefined
          ? [...config.numbering.sources, digit]
          : config.numbering.sources.map((source, i) => (i === sourceIndex ? digit : source));

      this.#repository.update(parameters.journalName, {
        numbering: { ...config.numbering, sources: updatedSources },
      });

      // Move the stored value to the new key in every connected note so a manually-set
      // number survives the rename instead of being stranded under the old key.
      if (oldKey !== undefined && digit.frontmatterKey !== oldKey) {
        yield* this.#connection.renameFieldAll(parameters.journalName, oldKey, digit.frontmatterKey);
      }
      return { variable: digit.variable };
    });
  }
}
