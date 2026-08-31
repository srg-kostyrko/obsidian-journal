import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt, Err } from "@/infrastructure/result";
import { toFlowError, UnknownJournalError } from "@/journals/errors";
import { NoteConnectionService } from "@/journals/notes/note-connection";
import { JournalsRepository } from "@/journals/repository";

import { editNoteletCounterKeyModal } from "../ui/modals";

export class EditNoteletCounterKeyFlow implements Flow<
  { journalName: string; typeId: string },
  { newValue: string },
  FlowError
> {
  readonly #modals = inject(ModalService);
  readonly #repository = inject(JournalsRepository);
  readonly #connection = inject(NoteConnectionService);

  execute(parameters: { journalName: string; typeId: string }): AsyncResult<{ newValue: string }, FlowError> {
    const configOpt = this.#repository.get(parameters.journalName);
    if (configOpt.isNone()) {
      return AsyncResult.err(toFlowError(new UnknownJournalError(parameters.journalName)));
    }
    if (configOpt.value.notelets[parameters.typeId] === undefined) {
      return AsyncResult.err(toFlowError(new UnknownJournalError(parameters.journalName)));
    }
    return attempt.in(this, async function* (this: EditNoteletCounterKeyFlow) {
      const submitted = yield* this.#modals
        .open(editNoteletCounterKeyModal, { journalName: parameters.journalName, typeId: parameters.typeId })
        .mapErr(() => new UserAborted("edit-notelet-counter-key-modal"));

      // Re-read across the await: the journal or the type may be gone by the time the modal
      // closes, and writing a spread of a stale value would resurrect it.
      const config = this.#repository.get(parameters.journalName).getOrUndefined();
      const type = config?.notelets[parameters.typeId];
      if (config === undefined || type === undefined) {
        return yield* new Err(toFlowError(new UnknownJournalError(parameters.journalName)));
      }

      const oldKey = type.counter.frontmatterKey;
      this.#repository.update(parameters.journalName, {
        notelets: {
          ...config.notelets,
          [parameters.typeId]: { ...type, counter: { ...type.counter, frontmatterKey: submitted.newValue } },
        },
      });

      // Notelets already written keep their counter under the old key; #parseNotelet reads it
      // by key, so a config-only rename strands every existing count and reapplyAll cannot
      // recover it (with no counter in the metadata, the old key is never removed).
      if (oldKey !== submitted.newValue) {
        yield* this.#connection.renameNoteletFieldForType(
          parameters.journalName,
          type.name,
          oldKey,
          submitted.newValue,
        );
      }
      return { newValue: submitted.newValue };
    });
  }
}
