import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt } from "@/infrastructure/result";
import { toFlowError, UnknownJournalError } from "@/journals/errors";
import { JournalsRepository } from "@/journals/repository";

import { editFrontmatterFieldModal, type FrontmatterFieldName } from "../ui/edit-frontmatter-field-modal";

export class EditFrontmatterFieldFlow implements Flow<
  { journalName: string; fieldName: FrontmatterFieldName },
  { newValue: string },
  FlowError
> {
  readonly #modals = inject(ModalService);
  readonly #repository = inject(JournalsRepository);

  execute(parameters: {
    journalName: string;
    fieldName: FrontmatterFieldName;
  }): AsyncResult<{ newValue: string }, FlowError> {
    const configOpt = this.#repository.get(parameters.journalName);
    if (configOpt.isNone()) {
      return AsyncResult.err(toFlowError(new UnknownJournalError(parameters.journalName)));
    }
    return attempt.in(this, async function* (this: EditFrontmatterFieldFlow) {
      const config = configOpt.getOr(undefined as never);
      const submitted = yield* this.#modals
        .open(editFrontmatterFieldModal, { journalName: parameters.journalName, fieldName: parameters.fieldName })
        .mapErr(() => new UserAborted("edit-frontmatter-field-modal"));
      this.#repository.update(parameters.journalName, {
        frontmatter: { ...config.frontmatter, [parameters.fieldName]: submitted.newValue },
      });
      return { newValue: submitted.newValue };
    });
  }
}
