import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt } from "@/infrastructure/result";
import { toFlowError, UnknownJournalError } from "@/journals/errors";
import { SettingsService } from "@/settings";

import { journalConfigCollection } from "../../config";
import { editFrontmatterFieldModal, type FrontmatterFieldName } from "../ui/edit-frontmatter-field-modal";

export class EditFrontmatterFieldFlow implements Flow<
  { journalName: string; fieldName: FrontmatterFieldName },
  { newValue: string },
  FlowError
> {
  readonly #modals = inject(ModalService);
  readonly #settings = inject(SettingsService);

  execute(parameters: {
    journalName: string;
    fieldName: FrontmatterFieldName;
  }): AsyncResult<{ newValue: string }, FlowError> {
    const collection = this.#settings.getCollection(journalConfigCollection);
    const config = collection.get(parameters.journalName);
    if (!config) {
      return AsyncResult.err(toFlowError(new UnknownJournalError(parameters.journalName)));
    }
    return attempt.in(this, async function* (this: EditFrontmatterFieldFlow) {
      const submitted = yield* this.#modals
        .open(editFrontmatterFieldModal, { journalName: parameters.journalName, fieldName: parameters.fieldName })
        .mapErr(() => new UserAborted("edit-frontmatter-field-modal"));
      config.frontmatter[parameters.fieldName] = submitted.newValue;
      return { newValue: submitted.newValue };
    });
  }
}
