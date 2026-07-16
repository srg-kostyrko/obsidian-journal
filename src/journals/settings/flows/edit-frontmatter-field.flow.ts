import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt } from "@/infrastructure/result";
import { toFlowError, UnknownJournalError } from "@/journals/errors";
import { NoteConnectionService } from "@/journals/notes/note-connection";
import { JournalsRepository } from "@/journals/repository";

import { editFrontmatterFieldModal, type FrontmatterFieldName } from "../ui/modals";

export class EditFrontmatterFieldFlow implements Flow<
  { journalName: string; fieldName: FrontmatterFieldName },
  { newValue: string },
  FlowError
> {
  readonly #modals = inject(ModalService);
  readonly #repository = inject(JournalsRepository);
  readonly #connection = inject(NoteConnectionService);

  execute(parameters: {
    journalName: string;
    fieldName: FrontmatterFieldName;
  }): AsyncResult<{ newValue: string }, FlowError> {
    const configOpt = this.#repository.get(parameters.journalName);
    if (configOpt.isNone()) {
      return AsyncResult.err(toFlowError(new UnknownJournalError(parameters.journalName)));
    }
    const config = configOpt.value;
    return attempt.in(this, async function* (this: EditFrontmatterFieldFlow) {
      const submitted = yield* this.#modals
        .open(editFrontmatterFieldModal, { journalName: parameters.journalName, fieldName: parameters.fieldName })
        .mapErr(() => new UserAborted("edit-frontmatter-field-modal"));
      const oldValue = config.frontmatter[parameters.fieldName];
      this.#repository.update(parameters.journalName, {
        frontmatter: { ...config.frontmatter, [parameters.fieldName]: submitted.newValue },
      });
      // Move the value to the new key in every connected note so nothing is stranded: renaming
      // the date field would otherwise orphan the note entirely, and renaming a start/end key
      // would leave a dead property behind (v2 rewrote every field).
      if (submitted.newValue !== oldValue) {
        yield* this.#connection.renameFieldAll(parameters.journalName, oldValue, submitted.newValue);
      }
      return { newValue: submitted.newValue };
    });
  }
}
